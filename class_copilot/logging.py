from __future__ import annotations

import sys

from loguru import logger

from class_copilot.config import AppConfig


def configure_logging(config: AppConfig) -> None:
    config.ensure_directories()
    logger.remove()
    logger.add(sys.stderr, level="INFO")
    logger.add(config.log_dir / "app_{time:YYYY-MM-DD}.log", rotation="00:00", level="INFO")
    logger.add(
        config.log_dir / "error_{time:YYYY-MM-DD}.log",
        rotation="00:00",
        level="ERROR",
        backtrace=True,
        diagnose=False,
    )
    for name in ("asr", "llm", "ws"):
        logger.add(
            config.log_dir / f"{name}_{{time:YYYY-MM-DD}}.log",
            rotation="00:00",
            level="DEBUG",
            filter=lambda record, module=name: record["extra"].get("module") == module,
        )
