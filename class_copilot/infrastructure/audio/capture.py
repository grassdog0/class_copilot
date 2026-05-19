from __future__ import annotations

import asyncio
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
        output_path: Path,
        audio_queue: asyncio.Queue[bytes],
        sample_rate: int = SAMPLE_RATE,
    ) -> None:
        self.audio_source = audio_source
        self.audio_device_id = audio_device_id
        self.output_path = output_path
        self.audio_queue = audio_queue
        self.sample_rate = sample_rate
        self.dropped_frames = 0
        self.started_at: float | None = None
        self._encoder: MP3Encoder | None = None
        self._stream: Any = None
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._loop: asyncio.AbstractEventLoop | None = None

    async def __aenter__(self) -> AudioCapture:
        self._loop = asyncio.get_running_loop()
        self._encoder = MP3Encoder(self.output_path, sample_rate=self.sample_rate)
        self.started_at = time.time()
        if self.audio_source == "loopback":
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

    def _loopback_worker(self) -> None:
        try:
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
            self._loop.call_soon_threadsafe(self.audio_queue.put_nowait, pcm)
        except asyncio.QueueFull:
            self.dropped_frames += 1
        except RuntimeError:
            return


def _to_pcm16_mono(data: Any) -> bytes:
    array = np.asarray(data)
    if array.ndim > 1:
        array = array[:, 0]
    if array.dtype != np.int16:
        array = np.clip(array, -1.0, 1.0)
        array = (array * 32767).astype(np.int16)
    return array.tobytes()
