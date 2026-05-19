from __future__ import annotations

from pathlib import Path

import lameenc

from class_copilot.config import MP3_BITRATE_KBPS, SAMPLE_RATE


class MP3Encoder:
    def __init__(self, path: Path, *, sample_rate: int = SAMPLE_RATE, bitrate: int = MP3_BITRATE_KBPS):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._encoder = lameenc.Encoder()
        self._encoder.set_bit_rate(bitrate)
        self._encoder.set_in_sample_rate(sample_rate)
        self._encoder.set_channels(1)
        self._encoder.set_quality(2)
        self._file = self.path.open("wb")
        self.bytes_written = 0

    def encode(self, pcm16: bytes) -> None:
        encoded = self._encoder.encode(pcm16)
        if encoded:
            self._file.write(encoded)
            self.bytes_written += len(encoded)

    def close(self) -> None:
        encoded = self._encoder.flush()
        if encoded:
            self._file.write(encoded)
            self.bytes_written += len(encoded)
        self._file.close()
