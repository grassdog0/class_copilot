from __future__ import annotations

import asyncio
import math
import time
from typing import Any

import numpy as np

from class_copilot.config import SAMPLE_RATE
from class_copilot.domain.exceptions import AudioDeviceError


class MicLevelMonitor:
    def __init__(self, broadcast) -> None:  # noqa: ANN001
        self._broadcast = broadcast
        self._stream: Any = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._last_emit = 0.0
        self.is_running = False

    async def start(self, *, device_id: int | str | None = None) -> str:
        if self.is_running:
            return "already_monitoring"
        self._loop = asyncio.get_running_loop()
        try:
            import sounddevice as sd

            def callback(indata, frames, time_info, status) -> None:  # noqa: ANN001, ARG001
                self._handle(indata)

            self._stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="float32",
                device=device_id,
                callback=callback,
            )
            self._stream.start()
        except Exception as exc:
            raise AudioDeviceError(f"audio device unavailable: {exc}") from exc
        self.is_running = True
        return "started"

    async def stop(self) -> str:
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
        self._stream = None
        self.is_running = False
        return "stopped"

    def _handle(self, data) -> None:  # noqa: ANN001
        now = time.monotonic()
        if now - self._last_emit < 0.1:
            return
        self._last_emit = now
        arr = np.asarray(data, dtype=np.float32)
        peak = float(np.max(np.abs(arr))) if arr.size else 0.0
        rms = float(np.sqrt(np.mean(np.square(arr)))) if arr.size else 0.0
        db = 20 * math.log10(max(rms, 1e-8))
        payload = {"type": "mic_level", "data": {"db": db, "peak": peak, "clipping": peak >= 0.99}}
        if self._loop and not self._loop.is_closed():
            self._loop.call_soon_threadsafe(lambda: asyncio.create_task(self._broadcast(payload)))


def list_audio_devices(settings) -> dict:  # noqa: ANN001
    microphones = []
    try:
        import sounddevice as sd

        default_input = sd.default.device[0] if sd.default.device else None
        for idx, device in enumerate(sd.query_devices()):
            if int(device.get("max_input_channels", 0)) > 0:
                microphones.append(
                    {
                        "index": idx,
                        "name": device.get("name", ""),
                        "channels": int(device.get("max_input_channels", 0)),
                        "sample_rate": int(device.get("default_samplerate", SAMPLE_RATE)),
                        "is_default": idx == default_input,
                    }
                )
    except Exception:
        microphones = []

    loopback_available = True
    loopbacks = []
    try:
        import soundcard as sc

        default = sc.default_speaker()
        for speaker in sc.all_speakers():
            loopbacks.append(
                {
                    "id": speaker.name,
                    "name": speaker.name,
                    "is_default": speaker.name == default.name,
                }
            )
    except Exception:
        loopback_available = False
        loopbacks = []

    source = settings.audio_source
    device_id = settings.audio_device_id
    return {
        "microphone": {
            "devices": microphones,
            "current_index": device_id if source == "microphone" else None,
        },
        "loopback": {
            "available": loopback_available,
            "devices": loopbacks,
            "current_id": device_id if source == "loopback" else None,
        },
        "audio_source": source,
    }
