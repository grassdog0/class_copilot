from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from class_copilot.domain.exceptions import ConfigurationError


class FernetKeyStore:
    def __init__(self, key_path: Path) -> None:
        self.key_path = key_path

    def load_or_create(self) -> bytes:
        self.key_path.parent.mkdir(parents=True, exist_ok=True)
        if self.key_path.exists():
            return self.key_path.read_bytes().strip()
        key = Fernet.generate_key()
        self.key_path.write_bytes(key)
        if os.name != "nt":
            self.key_path.chmod(0o600)
        return key


class SettingsCipher:
    def __init__(self, key_path: Path) -> None:
        self._fernet = Fernet(FernetKeyStore(key_path).load_or_create())

    def encrypt(self, value: str) -> str:
        return self._fernet.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt(self, key: str, value: str) -> str:
        try:
            return self._fernet.decrypt(value.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeError) as exc:
            raise ConfigurationError(f"encrypted setting cannot be decrypted: {key}") from exc


def mask_secret(value: str | None) -> str:
    if not value:
        return ""
    return f"{value[:4]}****"
