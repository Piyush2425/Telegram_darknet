"""Composition root for the Telegram Explorer feature.

Purpose:
    Builds explorer services from environment-based application configuration.
Responsibilities:
    Validate configuration, define standard session/export locations, and expose
    a small facade used by HTTP presentation layers.
Dependencies:
    The explorer service/repository modules and Python's standard library.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .entity_repository import MongoEntityRepository
from .entity_service import TelegramEntityService


class ExplorerConfigurationError(RuntimeError):
    """Indicate missing or invalid Telegram Explorer configuration."""


def _load_backend_env() -> None:
    """Load simple values from ``backend/.env`` without overriding the process.

    This mirrors the legacy Flask application's local-development behavior while
    keeping deployment-provided environment variables authoritative.
    """
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return
    with env_path.open(encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(
                key.strip(), value.strip().strip('"').strip("'")
            )


class TelegramExplorer:
    """Coordinate entity discovery and monitoring-selection persistence."""

    def __init__(
        self,
        repository: MongoEntityRepository,
        service: TelegramEntityService,
    ) -> None:
        """Initialize the facade with explicit dependencies.

        Args:
            repository: Entity persistence component.
            service: Telegram discovery component.
        """
        self.repository = repository
        self.service = service

    @classmethod
    def from_environment(cls) -> "TelegramExplorer":
        """Build an explorer from documented environment variables.

        Returns:
            Fully configured explorer facade.

        Raises:
            ExplorerConfigurationError: If Telegram credentials are absent or
                ``TELEGRAM_API_ID`` is not numeric.
        """
        _load_backend_env()
        api_id = os.getenv("TELEGRAM_API_ID", "").strip()
        api_hash = os.getenv("TELEGRAM_API_HASH", "").strip()
        if not api_id or not api_hash:
            raise ExplorerConfigurationError(
                "Set TELEGRAM_API_ID and TELEGRAM_API_HASH before using Explorer."
            )
        try:
            numeric_api_id = int(api_id)
        except ValueError as exc:
            raise ExplorerConfigurationError(
                "TELEGRAM_API_ID must be an integer."
            ) from exc

        config_dir = Path(
            os.getenv("DARKNET_MONITOR_CONFIG_DIR", "~/.darknet_monitor")
        ).expanduser()
        session_path = Path(
            os.getenv("TELEGRAM_SESSION_PATH", str(config_dir / "darknet_monitor"))
        ).expanduser()
        csv_path = Path(
            os.getenv(
                "TELEGRAM_ENTITIES_CSV",
                str(config_dir / "output" / "telegram_entities.csv"),
            )
        ).expanduser()
        repository = MongoEntityRepository(
            mongo_uri=os.getenv("MONGODB_URI", "mongodb://localhost:27017"),
            database_name=os.getenv("MONGODB_DATABASE", "darknet_monitor"),
            csv_path=csv_path,
        )
        service = TelegramEntityService(
            api_id=numeric_api_id,
            api_hash=api_hash,
            session_path=session_path,
            repository=repository,
        )
        return cls(repository, service)

    async def refresh(self) -> list[dict[str, Any]]:
        """Discover and persist all accessible Telegram groups and channels.

        Returns:
            Normalized entities found in the current Telegram refresh.
        """
        return await self.service.refresh()
