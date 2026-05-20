from __future__ import annotations

import asyncio
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

import numpy as np

from class_copilot.config import SAMPLE_RATE
from class_copilot.domain.exceptions import AudioDeviceError
from class_copilot.infrastructure.audio.encoder import MP3Encoder


class AudioCapture:
    def __init__(
        self,
        *,
        audio_source: str,
        audio_device_id: int | str | None,
        audio_file_path: str = "",
        output_path: Path,
        audio_queue: asyncio.Queue[bytes],
        sample_rate: int = SAMPLE_RATE,
    ) -> None:
        self.audio_source = audio_source
        self.audio_device_id = audio_device_id
        self.audio_file_path = audio_file_path
        self.output_path = output_path
        self.audio_queue = audio_queue
        self.sample_rate = sample_rate
        self.dropped_frames = 0
        self.started_at: float | None = None
        self._encoder: MP3Encoder | None = None
        self._stream: Any = None
        self._thread: threading.Thread | None = None
        self._process: subprocess.Popen[bytes] | None = None
        self._stop_event = threading.Event()
        self._loop: asyncio.AbstractEventLoop | None = None

    async def __aenter__(self) -> AudioCapture:
        self._loop = asyncio.get_running_loop()
        self._encoder = MP3Encoder(self.output_path, sample_rate=self.sample_rate)
        self.started_at = time.time()
        if self.audio_source == "file":
            self._start_file_stream()
        elif self.audio_source == "loopback":
            self._start_loopback()
        else:
            self._start_microphone()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
        self._stop_event.set()
        if self._stream is not None:
            stop = getattr(self._stream, "stop", None)
            close = getattr(self._stream, "close", None)
            if stop:
                stop()
            if close:
                close()
        if self._thread is not None:
            self._thread.join(timeout=2)
        if self._process is not None and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self._process.kill()
        if self._encoder is not None:
            self._encoder.close()

    @property
    def duration_seconds(self) -> float:
        if self.started_at is None:
            return 0.0
        return max(0.0, time.time() - self.started_at)

    @property
    def file_size_bytes(self) -> int:
        if self.output_path.exists():
            return self.output_path.stat().st_size
        return 0

    def _start_microphone(self) -> None:
        try:
            import sounddevice as sd

            def callback(indata, frames, time_info, status) -> None:  # noqa: ANN001, ARG001
                mono = _to_pcm16_mono(indata)
                self._handle_pcm(mono)

            self._stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype="int16",
                device=self.audio_device_id,
                callback=callback,
            )
            self._stream.start()
        except Exception as exc:
            raise AudioDeviceError(f"audio device unavailable: {exc}") from exc

    def _start_loopback(self) -> None:
        self._thread = threading.Thread(target=self._loopback_worker, daemon=True)
        self._thread.start()

    def _start_file_stream(self) -> None:
        path = Path(self.audio_file_path).expanduser()
        if not path.exists() or not path.is_file():
            raise AudioDeviceError(f"audio file not found: {path}")
        if shutil.which("ffmpeg") is None:
            raise AudioDeviceError("ffmpeg not found; install ffmpeg or choose microphone")
        self._thread = threading.Thread(target=self._file_worker, args=(path,), daemon=True)
        self._thread.start()

    def _file_worker(self, path: Path) -> None:
        bytes_per_second = self.sample_rate * 2
        chunk_duration = 0.1
        chunk_size = int(bytes_per_second * chunk_duration)
        try:
            self._process = subprocess.Popen(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(path),
                    "-f",
                    "s16le",
                    "-acodec",
                    "pcm_s16le",
                    "-ac",
                    "1",
                    "-ar",
                    str(self.sample_rate),
                    "-",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            assert self._process.stdout is not None
            next_tick = time.monotonic()
            while not self._stop_event.is_set():
                pcm = self._process.stdout.read(chunk_size)
                if not pcm:
                    break
                self._handle_pcm(pcm)
                next_tick += chunk_duration
                delay = next_tick - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
            if self._loop and not self._loop.is_closed() and not self._stop_event.is_set():
                self._loop.call_soon_threadsafe(self._enqueue_pcm, b"")
            if self._process.poll() is None:
                self._process.terminate()
        except Exception as exc:
            if self._loop and not self._loop.is_closed():
                self._loop.call_soon_threadsafe(self._enqueue_pcm, b"")
            raise AudioDeviceError(f"audio file stream failed: {exc}") from exc

    def _loopback_worker(self) -> None:
        try:
            _patch_soundcard_numpy_fromstring()
            import soundcard as sc

            speaker = sc.default_speaker()
            mic = sc.get_microphone(speaker.name, include_loopback=True)
            with mic.recorder(samplerate=self.sample_rate, channels=1) as recorder:
                while not self._stop_event.is_set():
                    data = recorder.record(numframes=1024)
                    self._handle_pcm(_to_pcm16_mono(data))
        except Exception as exc:
            if self._loop and not self._loop.is_closed():
                self._loop.call_soon_threadsafe(
                    lambda: self.audio_queue.put_nowait(b"")
                )
            raise AudioDeviceError(f"audio device unavailable: {exc}") from exc

    def _handle_pcm(self, pcm: bytes) -> None:
        if self._encoder:
            self._encoder.encode(pcm)
        if not self._loop or self._loop.is_closed():
            return
        try:
            self._loop.call_soon_threadsafe(self._enqueue_pcm, pcm)
        except RuntimeError:
            return

    def _enqueue_pcm(self, pcm: bytes) -> None:
        try:
            self.audio_queue.put_nowait(pcm)
        except asyncio.QueueFull:
            self.dropped_frames += 1


def _to_pcm16_mono(data: Any) -> bytes:
    array = np.asarray(data)
    if array.ndim > 1:
        array = array[:, 0]
    if array.dtype != np.int16:
        array = np.clip(array, -1.0, 1.0)
        array = (array * 32767).astype(np.int16)
    return array.tobytes()


def _patch_soundcard_numpy_fromstring() -> None:
    original = np.fromstring

    def compatible_fromstring(data, dtype=float, count=-1, *, sep="", like=None):  # noqa: ANN001
        if sep == "" and not isinstance(data, str | bytes | bytearray):
            return np.frombuffer(data, dtype=dtype, count=count, like=like)
        return original(data, dtype=dtype, count=count, sep=sep, like=like)

    if getattr(np.fromstring, "__name__", "") != "compatible_fromstring":
        np.fromstring = compatible_fromstring
