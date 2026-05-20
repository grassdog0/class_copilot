from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

HTTP_HOST = "127.0.0.1"
HTTP_PORT = 29037
SAMPLE_RATE = 16000
MP3_BITRATE_KBPS = 128


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CC_", env_file=".env", extra="ignore")

    data_dir: Path = Field(default=Path("data"))
    force_ipv4: bool = True
    debug_audio_file: bool = False

    @property
    def log_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def recordings_dir(self) -> Path:
        return self.data_dir / "recordings"

    @property
    def encryption_key_path(self) -> Path:
        return self.data_dir / ".encryption_key"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "class_copilot.db"

    @property
    def database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.db_path.as_posix()}"

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.recordings_dir.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_config() -> AppConfig:
    config = AppConfig()
    config.ensure_directories()
    return config
