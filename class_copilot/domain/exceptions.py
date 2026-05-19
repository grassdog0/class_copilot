class ClassCopilotError(Exception):
    """Base exception for expected application failures."""


class ASRConnectionError(ClassCopilotError):
    """Realtime ASR connection failed or disconnected."""


class ASRPermanentError(ClassCopilotError):
    """Realtime ASR failed with a non-recoverable error."""


class ConfigurationError(ClassCopilotError):
    """Required configuration is missing or invalid."""


class AudioDeviceError(ClassCopilotError):
    """Audio device discovery or capture failed."""
