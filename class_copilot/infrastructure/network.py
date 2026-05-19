from __future__ import annotations

import socket
from collections.abc import Callable
from typing import Any

from class_copilot.config import get_config

_original_getaddrinfo: Callable[..., Any] | None = None


def _should_patch_host(host: object) -> bool:
    if not isinstance(host, str):
        return False
    return host == "dashscope.aliyuncs.com" or host.endswith(".dashscope.aliyuncs.com")


def apply_ipv4_only_patch() -> None:
    global _original_getaddrinfo
    if _original_getaddrinfo is not None:
        return
    if not get_config().force_ipv4:
        return
    _original_getaddrinfo = socket.getaddrinfo

    def patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):  # noqa: ANN001
        if _should_patch_host(host):
            family = socket.AF_INET
        return _original_getaddrinfo(host, port, family, type, proto, flags)

    socket.getaddrinfo = patched_getaddrinfo


def unpatch() -> None:
    global _original_getaddrinfo
    if _original_getaddrinfo is None:
        return
    socket.getaddrinfo = _original_getaddrinfo
    _original_getaddrinfo = None
