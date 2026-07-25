"""Asynchronous Telegram dialog discovery service.

Purpose:
    Converts Telethon dialogs into normalized group and channel records.
Responsibilities:
    Connect with an existing user session, exclude personal/secret chats,
    classify entities, map Telegram failures, and persist discoveries.
Dependencies:
    Telethon for Telegram Client API access and the entity repository contract.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from telethon import TelegramClient, errors, types

from .entity_repository import EntityRepositoryError, MongoEntityRepository

LOGGER = logging.getLogger(__name__)


class TelegramExplorerError(RuntimeError):
    """Base error suitable for presentation in the Telegram Explorer UI."""


class InvalidSessionError(TelegramExplorerError):
    """Indicate that the configured user session is missing or invalid."""


class TelegramRateLimitError(TelegramExplorerError):
    """Indicate that Telegram requires discovery to pause before retrying."""

    def __init__(self, seconds: int) -> None:
        """Create a rate-limit error with Telegram's retry delay.

        Args:
            seconds: Required delay before another Telegram request.
        """
        self.seconds = seconds
        super().__init__(f"Telegram rate limit reached. Retry in {seconds} seconds.")


class TelegramConnectionError(TelegramExplorerError):
    """Indicate that Telegram could not be reached after reconnect attempts."""


class TelegramEntityService:
    """Discover accessible Telegram groups and channels via the Client API."""

    def __init__(
        self,
        api_id: int,
        api_hash: str,
        session_path: Path,
        repository: MongoEntityRepository,
        client_factory: Callable[..., TelegramClient] = TelegramClient,
        reconnect_attempts: int = 2,
    ) -> None:
        """Configure a discovery service.

        Args:
            api_id: Telegram application ID.
            api_hash: Telegram application hash.
            session_path: Existing Telethon user session path, without forcing
                a ``.session`` suffix.
            repository: Persistence destination for normalized entities.
            client_factory: Injectable Telethon client constructor.
            reconnect_attempts: Additional connections attempted on network errors.
        """
        self._api_id = api_id
        self._api_hash = api_hash
        self._session_path = session_path
        self._repository = repository
        self._client_factory = client_factory
        self._reconnect_attempts = reconnect_attempts

    @staticmethod
    def _session_file_path(session_path: Path) -> Path:
        """Return the SQLite session file Telethon stores for a base path."""
        if session_path.suffix == ".session":
            return session_path
        return Path(f"{session_path}.session")

    async def refresh(self) -> list[dict[str, Any]]:
        """Fetch dialogs asynchronously and persist groups/channels only.

        Returns:
            Normalized entities found during this refresh.

        Raises:
            InvalidSessionError: If the user session is not authorized.
            TelegramRateLimitError: If Telegram returns ``FloodWait``.
            TelegramConnectionError: If Telegram cannot be reached.
            TelegramExplorerError: For other Telegram authorization failures.
        """
        LOGGER.info("Refresh started")
        temp_dir: tempfile.TemporaryDirectory[str] | None = None
        client: TelegramClient | None = None
        try:
            session_base = self._session_path
            source_session_file = self._session_file_path(session_base)
            if source_session_file.exists():
                temp_dir = tempfile.TemporaryDirectory(prefix="darknet-monitor-telethon-")
                session_base = Path(temp_dir.name) / session_base.name
                isolated_session_file = self._session_file_path(session_base)
                isolated_session_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_session_file, isolated_session_file)
                for suffix in ("-journal", "-wal", "-shm"):
                    sibling_source = Path(f"{source_session_file}{suffix}")
                    if sibling_source.exists():
                        shutil.copy2(sibling_source, Path(f"{isolated_session_file}{suffix}"))

            client = self._client_factory(
                str(session_base),
                self._api_id,
                self._api_hash,
                auto_reconnect=True,
                connection_retries=self._reconnect_attempts,
            )
            await self._connect_with_retries(client)
            if not await client.is_user_authorized():
                raise InvalidSessionError(
                    "Telegram session is not authorized. Log in with the same "
                    "session using the existing Telegram login flow, then retry."
                )

            LOGGER.info("Telegram login", extra={"authorized": True})
            now = datetime.now(timezone.utc)
            discovered: list[dict[str, Any]] = []
            async for dialog in client.iter_dialogs():
                normalized = self._normalize(dialog.entity, now)
                if normalized is not None:
                    discovered.append(normalized)

            LOGGER.info("Entities found", extra={"entity_count": len(discovered)})
            await asyncio.to_thread(self._repository.upsert_discovered, discovered)
            return discovered
        except errors.FloodWaitError as exc:
            LOGGER.warning("Telegram rate limit", extra={"retry_seconds": exc.seconds})
            raise TelegramRateLimitError(exc.seconds) from exc
        except (
            errors.AuthKeyError,
            errors.AuthKeyUnregisteredError,
            errors.SessionPasswordNeededError,
            errors.UnauthorizedError,
        ) as exc:
            LOGGER.exception("Invalid Telegram session")
            raise InvalidSessionError(
                "Telegram authorization is invalid or incomplete. Re-authenticate "
                "the configured user session and retry."
            ) from exc
        except InvalidSessionError:
            raise
        except (ConnectionError, OSError, TimeoutError) as exc:
            LOGGER.exception("Telegram connection failed")
            raise TelegramConnectionError(
                "Could not connect to Telegram. Check the network and try again."
            ) from exc
        except EntityRepositoryError:
            LOGGER.exception("Entity persistence failed")
            raise
        except TelegramExplorerError:
            raise
        except errors.RPCError as exc:
            LOGGER.exception("Telegram API error")
            raise TelegramExplorerError(f"Telegram rejected discovery: {exc}") from exc
        except Exception as exc:
            LOGGER.exception("Unexpected Telegram discovery error")
            raise TelegramExplorerError(
                "Telegram discovery failed unexpectedly. Check the application logs."
            ) from exc
        finally:
            if client is not None and client.is_connected():
                await client.disconnect()
            if temp_dir is not None:
                temp_dir.cleanup()

    async def _connect_with_retries(self, client: TelegramClient) -> None:
        """Connect a Telethon client with bounded retries.

        Args:
            client: Client to connect.

        Raises:
            TelegramConnectionError: If every attempt fails.
        """
        last_error: BaseException | None = None
        for attempt in range(self._reconnect_attempts + 1):
            try:
                await client.connect()
                return
            except (ConnectionError, OSError, TimeoutError) as exc:
                last_error = exc
                LOGGER.warning(
                    "Reconnect attempt",
                    extra={"attempt": attempt + 1, "max": self._reconnect_attempts + 1},
                )
                if attempt < self._reconnect_attempts:
                    await asyncio.sleep(min(2**attempt, 4))
        raise TelegramConnectionError(
            "Could not connect to Telegram after multiple attempts."
        ) from last_error

    @staticmethod
    def _normalize(entity: Any, synced_at: datetime) -> dict[str, Any] | None:
        """Normalize a Telethon group/channel and reject unsupported chat types.

        Args:
            entity: Telethon entity supplied by a dialog.
            synced_at: UTC timestamp shared by this refresh.

        Returns:
            Entity dictionary, or ``None`` for users and secret chats.
        """
        if isinstance(entity, types.Channel):
            entity_type = "Supergroup" if entity.megagroup else "Channel"
        elif isinstance(entity, types.Chat):
            entity_type = "Group"
        else:
            return None

        username = getattr(entity, "username", None)
        return {
            "telegram_id": int(entity.id),
            "title": getattr(entity, "title", None) or "Untitled",
            "username": username,
            "type": entity_type,
            "is_private": not bool(username),
            "participants_count": getattr(entity, "participants_count", None),
            "access_hash": getattr(entity, "access_hash", None),
            "last_synced": synced_at,
        }
