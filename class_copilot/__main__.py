"""应用入口 - python -m class_copilot"""

import sys
import asyncio
import webbrowser
import threading

from loguru import logger

from class_copilot.config import settings
from class_copilot.logger import setup_logging
from class_copilot.network_patch import apply_ipv4_only_patch


def main():
    # 在所有网络组件初始化之前应用 IPv4-only 补丁
    # （避免 IPv6 路径不通导致 DashScope WebSocket 连接超时）
    apply_ipv4_only_patch()
    setup_logging()
    logger.info("听课助手 v2.0.0 启动中...")

    from class_copilot.app import create_app

    app = create_app()

    import uvicorn

    host = "127.0.0.1"
    port = settings.server_port

    # 延迟打开浏览器
    def open_browser():
        import time
        time.sleep(1.5)
        webbrowser.open(f"http://{host}:{port}")

    threading.Thread(target=open_browser, daemon=True).start()

    # 启动系统托盘（独立线程）
    from class_copilot.services.tray_service import start_tray

    tray_thread = threading.Thread(target=start_tray, daemon=True)
    tray_thread.start()

    logger.info(f"服务启动于 http://{host}:{port}")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
