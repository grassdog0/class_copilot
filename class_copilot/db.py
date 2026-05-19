from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from class_copilot.config import AppConfig, get_config
from class_copilot.infrastructure.persistence.orm import Base

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None
_database_url: str | None = None


def get_engine(config: AppConfig | None = None) -> AsyncEngine:
    global _engine, _sessionmaker, _database_url
    cfg = config or get_config()
    if _engine is None or _database_url != cfg.database_url:
        cfg.ensure_directories()
        _engine = create_async_engine(cfg.database_url, future=True)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
        _database_url = cfg.database_url
    return _engine


def get_sessionmaker(config: AppConfig | None = None) -> async_sessionmaker[AsyncSession]:
    get_engine(config)
    if _sessionmaker is None:
        raise RuntimeError("database sessionmaker was not initialized")
    return _sessionmaker


async def create_all(config: AppConfig | None = None) -> None:
    engine = get_engine(config)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def session_scope(config: AppConfig | None = None) -> AsyncIterator[AsyncSession]:
    maker = get_sessionmaker(config)
    async with maker() as session:
        yield session
