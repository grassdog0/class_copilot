"""网络补丁：对特定域名强制使用 IPv4

背景：
- DashScope (`dashscope.aliyuncs.com`) 同时返回 IPv6 和 IPv4 地址，
  且 DNS 顺序把 IPv6 放在前面。
- 国内大量家宽 / 公网到阿里云 IPv6 路径不稳定，连接会长时间卡 SYN 直至超时。
- DashScope SDK 底层使用 `websocket-client`，按 `getaddrinfo` 顺序尝试，
  会优先连 IPv6，等到 5s 超时后已经判定连接失败。
- 后果：ASR 预连接 100% 失败，提示 "websocket connection could not established"。

解决方案：
- 在程序最早期对 `socket.getaddrinfo` 打补丁，
  仅对受影响的域名过滤掉 IPv6 结果，回退到 IPv4 直连。
- 其他网络请求不受影响。

使用方式：
- 在 `class_copilot/__main__.py` 里尽早调用 `apply_ipv4_only_patch()`。
"""
from __future__ import annotations

import socket

# 已知存在 IPv6 不可达问题、需要强制走 IPv4 的域名后缀。
# 全部小写匹配 hostname 的后缀，覆盖各级子域。
_IPV4_ONLY_HOST_SUFFIXES: tuple[str, ...] = (
    "dashscope.aliyuncs.com",
    "dashscope-intl.aliyuncs.com",
)

_patched = False


def _should_force_ipv4(host: object) -> bool:
    if not isinstance(host, str):
        return False
    host_lc = host.lower()
    return any(host_lc == s or host_lc.endswith("." + s) or host_lc.endswith(s)
               for s in _IPV4_ONLY_HOST_SUFFIXES)


def apply_ipv4_only_patch() -> None:
    """对 DashScope 相关域名强制 IPv4。重复调用安全。"""
    global _patched
    if _patched:
        return

    original_getaddrinfo = socket.getaddrinfo

    def patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        if _should_force_ipv4(host) and family in (0, socket.AF_UNSPEC):
            try:
                return original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
            except socket.gaierror:
                # IPv4 解析失败时退回原行为，避免完全无解
                return original_getaddrinfo(host, port, family, type, proto, flags)
        return original_getaddrinfo(host, port, family, type, proto, flags)

    socket.getaddrinfo = patched_getaddrinfo  # type: ignore[assignment]
    _patched = True
