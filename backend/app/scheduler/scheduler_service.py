"""Scheduling service for Telegram message collection.

Purpose:
    Run sequential message collection jobs for enabled Telegram groups/channels.
Responsibilities:
    Load enabled entities, open one Telegram connection at a time, collect new
    messages, and persist each chat snapshot separately.
Dependencies:
    The existing Explorer entity repository, Telethon, and the scrape repository.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import shutil
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, time, timezone, timedelta
from pathlib import Path
from typing import Any, Callable, Mapping

from telethon import TelegramClient, errors, types

from app.explorer.telegram_explorer import TelegramExplorer

from .message_collector import parse_telegram_message
from .scrape_repository import TelegramGroupScrapeRepository

LOGGER = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30))


@dataclass(frozen=True)
class SchedulerConfig:
    """Configuration for the message collection scheduler."""

    run_at: time
    interval_hours: int = 24


class TelegramGroupScheduler:
    """Collect new messages from all enabled Telegram chats on a schedule."""

    def __init__(
        self,
        explorer: TelegramExplorer,
        scrape_repository: TelegramGroupScrapeRepository,
        session_path: Path,
        api_id: int,
        api_hash: str,
        client_factory: Callable[..., TelegramClient] = TelegramClient,
        reconnect_attempts: int = 2,
        on_event: Callable[[str, str], None] | None = None,
        report_agent: Any | None = None,
    ) -> None:
        self._explorer = explorer
        self._scrape_repository = scrape_repository
        self._session_path = session_path
        self._api_id = api_id
        self._api_hash = api_hash
        self._client_factory = client_factory
        self._reconnect_attempts = reconnect_attempts
        # Optional event callback: on_event(level, message, **details)
        self._on_event = on_event
        self._report_agent = report_agent
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._manual_thread: threading.Thread | None = None
        self._config: SchedulerConfig | None = None
        self._dispatcher_lock = threading.Lock()
        self._group_state_lock = threading.Lock()
        self._group_threads: dict[int, threading.Thread] = {}
        self._group_locks: dict[int, threading.Lock] = {}
        self._queue: list[dict[str, Any]] = []
        self._active_entity: dict[str, Any] | None = None
        self._active_entities: list[dict[str, Any]] = []
        self._last_results: list[dict[str, Any]] = []
        self._run_count: int = 0
        self._last_run_started_at: str | None = None
        self._last_run_finished_at: str | None = None
        self._next_run_at: str | None = None
        self._poll_interval_seconds = 10

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _session_file_path(session_path: Path) -> Path:
        if session_path.suffix == ".session":
            return session_path
        return Path(f"{session_path}.session")

    @staticmethod
    def _resolve_input_entity(entity: Mapping[str, Any]) -> types.TypeInputPeer:
        telegram_id = int(entity["telegram_id"])
        access_hash = entity.get("access_hash")
        entity_type = str(entity.get("type") or "").lower()

        if entity_type in {"channel", "supergroup"}:
            if access_hash is None:
                raise ValueError(f"Missing access hash for Telegram channel {telegram_id}.")
            return types.InputPeerChannel(channel_id=telegram_id, access_hash=int(access_hash))

        return types.InputPeerChat(chat_id=telegram_id)

    def _emit(self, level: str, message: str, **details: Any) -> None:
        """Emit a structured log event through the registered callback."""
        if self._on_event is not None:
            try:
                self._on_event(level, message, **details)
            except Exception:
                LOGGER.debug("Event callback raised an exception", exc_info=True)

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        if isinstance(value, str) and value:
            try:
                parsed = datetime.fromisoformat(value)
                return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
            except ValueError:
                return None
        return None

    @staticmethod
    def _interval_minutes(entity: Mapping[str, Any]) -> int:
        try:
            value = int(entity.get("interval_minutes") or 60)
            return max(value, 1)
        except (TypeError, ValueError):
            return 60

    def _group_lock(self, telegram_id: int) -> threading.Lock:
        with self._group_state_lock:
            lock = self._group_locks.get(int(telegram_id))
            if lock is None:
                lock = threading.Lock()
                self._group_locks[int(telegram_id)] = lock
            return lock

    def _is_group_active(self, telegram_id: int) -> bool:
        thread = self._group_threads.get(int(telegram_id))
        return bool(thread and thread.is_alive())

    def _current_group_state(self, entity: Mapping[str, Any]) -> dict[str, Any]:
        telegram_id = int(entity["telegram_id"])
        state = self._scrape_repository.get_chat_metrics(telegram_id)
        next_scrape_at = state.get("next_scrape_at")
        parsed_next = self._parse_datetime(next_scrape_at)
        if parsed_next is None:
            last_scraped = self._parse_datetime(state.get("last_scraped"))
            if last_scraped is not None:
                parsed_next = last_scraped + timedelta(minutes=self._interval_minutes(entity))
        return {
            "telegram_id": telegram_id,
            "title": entity.get("title"),
            "type": entity.get("type"),
            "enabled": bool(entity.get("enabled")),
            "status": state.get("monitoring_status") or ("active" if self._is_group_active(telegram_id) else "idle"),
            "interval_minutes": int(state.get("interval_minutes") or self._interval_minutes(entity)),
            "messages_stored": int(state.get("messages_stored") or 0),
            "last_scrape": state.get("last_scraped"),
            "last_analysis": state.get("last_analysis_at"),
            "last_message_id": state.get("last_message_id"),
            "last_analysis_message_id": state.get("last_analysis_message_id"),
            "next_scrape_at": parsed_next.isoformat() if parsed_next else None,
            "last_error": state.get("last_error"),
        }

    def _schedule_group_run(self, entity: Mapping[str, Any], force: bool = False) -> bool:
        telegram_id = int(entity["telegram_id"])
        lock = self._group_lock(telegram_id)
        if lock.locked() or self._is_group_active(telegram_id):
            return False

        state = self._scrape_repository.get_chat_metrics(telegram_id)
        next_scrape_at = self._parse_datetime(state.get("next_scrape_at"))
        last_scraped = self._parse_datetime(state.get("last_scraped"))
        interval_minutes = self._interval_minutes(entity)
        if not force and next_scrape_at is not None and next_scrape_at > datetime.now(timezone.utc):
            return False
        if not force and next_scrape_at is None and last_scraped is not None:
            next_scrape_at = last_scraped + timedelta(minutes=interval_minutes)
            if next_scrape_at > datetime.now(timezone.utc):
                return False

        def worker() -> None:
            with lock:
                try:
                    thread_result = asyncio.run(self._scrape_group(entity, full_history=False))
                    with self._group_state_lock:
                        self._last_results = [thread_result] + self._last_results[:19]
                    self._emit(
                        "info" if thread_result.get("success") else "warning",
                        "Group scrape completed",
                        telegram_id=telegram_id,
                        success=thread_result.get("success"),
                        messages_saved=thread_result.get("messages_saved"),
                    )
                except Exception:
                    LOGGER.exception("Per-group scrape worker failed", extra={"telegram_id": telegram_id})
                finally:
                    with self._group_state_lock:
                        self._group_threads.pop(telegram_id, None)

        thread = threading.Thread(
            target=worker,
            name=f"telegram-group-scheduler-{telegram_id}",
            daemon=True,
        )
        with self._group_state_lock:
            self._group_threads[telegram_id] = thread
        thread.start()
        return True

    def _poll_groups(self, force: bool = False) -> list[dict[str, Any]]:
        groups = self._explorer.repository.list_enabled()
        self._queue = []
        active_entities: list[dict[str, Any]] = []
        results: list[dict[str, Any]] = []
        for entity in groups:
            state = self._current_group_state(entity)
            if self._is_group_active(int(entity["telegram_id"])):
                active_entities.append(state)
                continue
            should_run = force
            if not should_run:
                next_scrape_at = self._parse_datetime(state.get("next_scrape_at"))
                last_scrape = self._parse_datetime(state.get("last_scrape"))
                now = datetime.now(timezone.utc)
                if next_scrape_at is None and last_scrape is None:
                    should_run = True
                elif next_scrape_at is not None:
                    should_run = next_scrape_at <= now
                elif last_scrape is not None:
                    should_run = (last_scrape + timedelta(minutes=state["interval_minutes"])) <= now
            if should_run and self._schedule_group_run(entity, force=force):
                active_entities.append(state)
                self._queue.append({
                    "telegram_id": entity.get("telegram_id"),
                    "title": entity.get("title"),
                    "type": entity.get("type"),
                    "next_scrape_at": state.get("next_scrape_at"),
                })
            else:
                results.append(state)
        self._active_entities = active_entities
        if active_entities:
            self._active_entity = active_entities[0]
        else:
            self._active_entity = None
        next_times = [self._parse_datetime(item.get("next_scrape_at")) for item in results if self._parse_datetime(item.get("next_scrape_at"))]
        self._next_run_at = min(next_times).isoformat() if next_times else None
        return results

    # ------------------------------------------------------------------
    # Configuration and lifecycle
    # ------------------------------------------------------------------

    def configure(self, config: SchedulerConfig) -> None:
        self._config = config

    def start(self, config: SchedulerConfig | None = None) -> None:
        if config is not None:
            self.configure(config)
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, name="telegram-group-scheduler", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def status(self) -> dict[str, Any]:
        queue = [
            {
                "telegram_id": item.get("telegram_id"),
                "title": item.get("title"),
                "type": item.get("type"),
                "next_scrape_at": item.get("next_scrape_at"),
            }
            for item in self._queue
        ]
        return {
            "running": bool(
                (self._thread and self._thread.is_alive())
                or (self._manual_thread and self._manual_thread.is_alive())
                or any(thread.is_alive() for thread in self._group_threads.values())
            ),
            "active": any(thread.is_alive() for thread in self._group_threads.values()),
            "configured": self._config is not None,
            "run_at": self._config.run_at.isoformat() if self._config else None,
            "interval_hours": self._config.interval_hours if self._config else None,
            "queue": queue,
            "active_entity": self._active_entity,
            "active_entities": self._active_entities,
            "last_results": self._last_results,
            "run_count": self._run_count,
            "last_run_started_at": self._last_run_started_at,
            "last_run_finished_at": self._last_run_finished_at,
            "next_run_at": self._next_run_at,
        }

    # ------------------------------------------------------------------
    # Trigger helpers (public API)
    # ------------------------------------------------------------------

    def run_now(self) -> dict[str, Any]:
        return asyncio.run(self.run_once(force=True))

    def start_now(self) -> dict[str, Any]:
        """Start monitoring for all enabled chats in the background."""

        def worker() -> None:
            try:
                asyncio.run(self.run_once(force=True))
            except Exception:
                LOGGER.exception("Manual Telegram message collection failed")

        self._manual_thread = threading.Thread(
            target=worker,
            name="telegram-group-scheduler-manual-run",
            daemon=True,
        )
        self._manual_thread.start()
        return {"success": True, "started": True, "scheduler": self.status()}

    def run_selected_now(self, telegram_ids: list[int]) -> dict[str, Any]:
        """Start scraping a specific set of entities in the background (non-blocking)."""

        def worker() -> None:
            try:
                asyncio.run(self.scrape_selected_entities(telegram_ids))
            except Exception:
                LOGGER.exception("Selected Telegram entity scraping failed")

        self._manual_thread = threading.Thread(
            target=worker,
            name="telegram-group-scheduler-selected-run",
            daemon=True,
        )
        self._manual_thread.start()
        return {"success": True, "started": True, "count": len(telegram_ids), "scheduler": self.status()}

    def run_entity_now(self, telegram_id: int, full_history: bool = True) -> dict[str, Any]:
        """Synchronously scrape one entity for Flask request handlers."""
        return asyncio.run(self.scrape_entity_once(telegram_id, full_history=full_history))

    def set_group_interval(self, telegram_id: int, interval_minutes: int) -> dict[str, Any]:
        entity = self._explorer.repository.get_entity(int(telegram_id))
        if entity is None:
            raise ValueError(f"Telegram entity {telegram_id} not found")
        updated = self._explorer.repository.set_interval_minutes(int(telegram_id), interval_minutes)
        state = self._scrape_repository.update_scrape_state(
            int(telegram_id),
            interval_minutes=int(updated.get("interval_minutes") or interval_minutes),
            monitoring_status=updated.get("monitoring_status") or "idle",
        )
        return {"entity": updated, "state": state}

    def start_group_monitoring(self, telegram_id: int) -> dict[str, Any]:
        entity = self._explorer.repository.get_entity(int(telegram_id))
        if entity is None:
            return {"success": False, "error": "Telegram entity not found"}
        updated = self._explorer.repository.set_enabled([int(telegram_id)], True)
        self._scrape_repository.update_scrape_state(int(telegram_id), monitoring_status="idle")
        
        # Trigger immediate background scrape run for this entity
        self._schedule_group_run(entity, force=True)
        
        return {"success": True, "modified_count": updated, "entity": self._explorer.repository.get_entity(int(telegram_id))}


    def stop_group_monitoring(self, telegram_id: int) -> dict[str, Any]:
        entity = self._explorer.repository.get_entity(int(telegram_id))
        if entity is None:
            return {"success": False, "error": "Telegram entity not found"}
        updated = self._explorer.repository.set_enabled([int(telegram_id)], False)
        self._scrape_repository.update_scrape_state(int(telegram_id), monitoring_status="stopped")
        return {"success": True, "modified_count": updated, "entity": self._explorer.repository.get_entity(int(telegram_id))}

    def get_group_status(self, telegram_id: int) -> dict[str, Any] | None:
        entity = self._explorer.repository.get_entity(int(telegram_id))
        if entity is None:
            return None
        return self._current_group_state(entity)

    # ------------------------------------------------------------------
    # Entity resolution
    # ------------------------------------------------------------------

    async def _resolve_entity_for_scrape(self, telegram_id: int) -> dict[str, Any] | None:
        """Resolve a Telegram entity from storage or the live authorized session."""
        entity = self._explorer.repository.get_entity(int(telegram_id))
        if entity is not None:
            return entity

        temp_dir: tempfile.TemporaryDirectory[str] | None = None
        session_base = self._session_path
        source_session_file = self._session_file_path(session_base)
        if source_session_file.exists():
            temp_dir = tempfile.TemporaryDirectory(prefix="darknet-monitor-scheduler-resolve-")
            session_base = Path(temp_dir.name) / session_base.name
            session_base.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_session_file, self._session_file_path(session_base))

        client = self._client_factory(
            str(session_base),
            self._api_id,
            self._api_hash,
            auto_reconnect=True,
            connection_retries=5,
            request_retries=5,
        )
        try:
            await client.connect()
            if not await client.is_user_authorized():
                return None

            async for dialog in client.iter_dialogs():
                dialog_entity = dialog.entity
                if getattr(dialog_entity, "id", None) == int(telegram_id):
                    return self._explorer.repository.get_entity(int(telegram_id)) or {
                        "telegram_id": int(dialog_entity.id),
                        "title": getattr(dialog_entity, "title", None) or "Untitled",
                        "username": getattr(dialog_entity, "username", None),
                        "type": "Supergroup"
                        if isinstance(dialog_entity, types.Channel) and getattr(dialog_entity, "megagroup", False)
                        else ("Channel" if isinstance(dialog_entity, types.Channel) else "Group"),
                        "is_private": not bool(getattr(dialog_entity, "username", None)),
                        "participants_count": getattr(dialog_entity, "participants_count", None),
                        "access_hash": getattr(dialog_entity, "access_hash", None),
                    }
        except Exception:
            LOGGER.exception("Failed to resolve Telegram entity from live session", extra={"telegram_id": telegram_id})
        finally:
            if client.is_connected():
                await client.disconnect()
            if temp_dir is not None:
                temp_dir.cleanup()

        return None

    # ------------------------------------------------------------------
    # Core scraping coroutines
    # ------------------------------------------------------------------

    async def run_once(self, force: bool = False) -> dict[str, Any]:
        """Collect new messages from every enabled Telegram chat once."""
        self._run_count += 1
        self._last_run_started_at = datetime.now(timezone.utc).isoformat()
        self._emit("info", "Scheduled scraping run started", run_count=self._run_count)
        try:
            entities = self._explorer.repository.list_enabled()
            self._queue = list(entities)
            self._poll_groups(force=force)
            succeeded = len([thread for thread in self._group_threads.values() if thread.is_alive()])
            self._emit(
                "info",
                "Scheduled scraping run completed",
                run_count=self._run_count,
                total=len(entities),
                succeeded=succeeded,
                failed=max(len(entities) - succeeded, 0),
            )
            if self._report_agent is not None:
                try:
                    self._report_agent.write_combined_report(entities, scraped_at=datetime.now(IST))
                except Exception:
                    LOGGER.exception("Combined analysis report update failed")
            return {
                "success": True,
                "group_count": len(entities),
                "scheduled": len(self._queue),
                "active": len(self._active_entities),
                "results": self._last_results,
            }
        except Exception as exc:
            self._emit("error", "Scheduled scraping run failed", error=str(exc))
            raise
        finally:
            self._queue = []
            if not self._active_entities:
                self._active_entity = None
            self._last_run_finished_at = datetime.now(timezone.utc).isoformat()
    

    async def scrape_selected_entities(self, telegram_ids: list[int]) -> dict[str, Any]:
        """Collect messages from a specific selection of Telegram chats."""
        self._emit("info", "Selected scraping started", count=len(telegram_ids))
        try:
            identifiers = [int(identifier) for identifier in telegram_ids if str(identifier).strip()]
            entities: list[dict[str, Any]] = []
            for identifier in identifiers:
                entity = self._explorer.repository.get_entity(identifier)
                if entity is not None:
                    entities.append(entity)
            if not entities:
                return {"success": False, "error": "No known Telegram entities were provided."}

            self._queue = list(entities)
            scheduled = [self._schedule_group_run(entity, force=True) for entity in entities]
            succeeded = sum(1 for value in scheduled if value)
            self._emit(
                "info",
                "Selected scraping completed",
                total=len(entities),
                succeeded=succeeded,
                failed=len(entities) - succeeded,
            )
            return {
                "success": True,
                "selected_count": len(entities),
                "scheduled": succeeded,
                "results": self._last_results,
            }
        finally:
            self._queue = []
            if not self._active_entities:
                self._active_entity = None

    async def scrape_entity_once(self, telegram_id: int, full_history: bool = True) -> dict[str, Any]:
        """Scrape one discovered Telegram entity while respecting the global queue lock."""
        try:
            entity = await self._resolve_entity_for_scrape(int(telegram_id))
            if entity is None:
                return {
                    "telegram_id": int(telegram_id),
                    "success": False,
                    "error": "Telegram entity is not known or not accessible in the current session. Refresh Explorer first.",
            }
            self._queue = [entity]
            self._active_entity = {
                "telegram_id": entity.get("telegram_id"),
                "title": entity.get("title"),
                "type": entity.get("type"),
            }
            self._queue = []
            result = await self._scrape_group(entity, full_history=full_history)
            with self._group_state_lock:
                self._last_results = [result] + self._last_results[:19]
            return result
        finally:
            self._queue = []
            self._active_entity = None

    # ------------------------------------------------------------------
    # Background loop
    # ------------------------------------------------------------------

    def _run_loop(self) -> None:
        """Main background scheduling loop that runs immediately and then repeats by interval."""
        while not self._stop_event.is_set():
            if self._config is None:
                self._stop_event.wait(5)
                continue

            try:
                asyncio.run(self.run_once(force=False))
            except Exception:
                LOGGER.exception("Scheduled Telegram message collection failed")

            if self._stop_event.wait(self._poll_interval_seconds):
                break

    # ------------------------------------------------------------------
    # Per-entity scrape
    # ------------------------------------------------------------------

    async def _scrape_group(self, entity: Mapping[str, Any], full_history: bool = False) -> dict[str, Any]:
        """Collect and persist messages for one Telegram chat."""
        title = entity.get("title") or str(entity.get("telegram_id"))
        telegram_id_val = entity.get("telegram_id")
        self._emit("info", f"Scraping started: {title}", telegram_id=telegram_id_val, title=title)
        try:
            telegram_id_int = int(entity["telegram_id"])
            self._explorer.repository.update_monitoring_state(
                telegram_id_int,
                monitoring_status="active",
                last_error=None,
            )
            self._scrape_repository.update_scrape_state(
                telegram_id_int,
                monitoring_status="active",
                last_error=None,
            )
        except Exception:
            LOGGER.debug("Unable to mark monitoring state active", exc_info=True)

        session_base = self._session_path
        source_session_file = self._session_file_path(session_base)
        if source_session_file.exists():
            temp_dir = tempfile.TemporaryDirectory(prefix="darknet-monitor-scheduler-")
            session_base = Path(temp_dir.name) / session_base.name
            session_base.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_session_file, self._session_file_path(session_base))
        else:
            temp_dir = None

        client = self._client_factory(
            str(session_base),
            self._api_id,
            self._api_hash,
            auto_reconnect=True,
            connection_retries=5,
            request_retries=5,
        )
        messages_saved = 0
        try:
            await client.connect()
            if not await client.is_user_authorized():
                err = "Session is not authorized."
                self._emit("error", f"Scraping failed: {title}", telegram_id=telegram_id_val, error=err)
                return {
                    "telegram_id": telegram_id_val,
                    "success": False,
                    "error": err,
                }
            target = self._resolve_input_entity(entity)
            telegram_id = int(entity["telegram_id"])
            last_message_id = self._scrape_repository.get_message_checkpoint(telegram_id) or 0
            oldest_message_id = self._scrape_repository.get_oldest_message_checkpoint(telegram_id)
            messages: list[dict[str, Any]] = []

            # 1. First run / no checkpoint -> Scrape last 24 hours of messages
            if not last_message_id:
                now_utc = datetime.now(timezone.utc)
                twenty_four_hours_ago = now_utc - timedelta(hours=24)
                
                # Fetch starting from newest down to 24 hours ago
                async for message in client.iter_messages(target, limit=1000):
                    # Check if message is older than 24 hours
                    msg_date = message.date
                    if msg_date:
                        # Ensure msg_date has timezone info
                        if msg_date.tzinfo is None:
                            msg_date = msg_date.replace(tzinfo=timezone.utc)
                        if msg_date < twenty_four_hours_ago:
                            break
                    messages.append(await parse_telegram_message(message, entity, telegram_id))
                
                if messages:
                    last_message_id = max(msg["message_id"] for msg in messages)
                    oldest_message_id = min(msg["message_id"] for msg in messages)
                    self._scrape_repository.save_message_checkpoint(telegram_id, last_message_id)
                    self._scrape_repository.save_oldest_message_checkpoint(telegram_id, oldest_message_id)
            else:
                # 2. Subsequent runs:
                # Part A: Scrape forwards for new messages
                forward_messages = []
                async for message in client.iter_messages(target, min_id=last_message_id, reverse=True):
                    forward_messages.append(await parse_telegram_message(message, entity, telegram_id))
                
                if forward_messages:
                    last_message_id = max(msg["message_id"] for msg in forward_messages)
                    self._scrape_repository.save_message_checkpoint(telegram_id, last_message_id)
                    messages.extend(forward_messages)
                
                # Part B: Scrape backwards continuously in chunks of 100 older messages
                if oldest_message_id is not None and oldest_message_id > 1:
                    backward_messages = []
                    async for message in client.iter_messages(target, max_id=oldest_message_id - 1, limit=100):
                        backward_messages.append(await parse_telegram_message(message, entity, telegram_id))
                    
                    if backward_messages:
                        oldest_message_id = min(msg["message_id"] for msg in backward_messages)
                        self._scrape_repository.save_oldest_message_checkpoint(telegram_id, oldest_message_id)
                        messages.extend(backward_messages)
                    else:
                        # Reached the very beginning of the channel history
                        self._scrape_repository.save_oldest_message_checkpoint(telegram_id, 1)

            messages_saved = self._scrape_repository.save_messages(entity, messages)

            self._scrape_repository.export_messages_csv(entity)
            scraped_at = datetime.now(timezone.utc)
            next_scrape_at = scraped_at + timedelta(minutes=self._interval_minutes(entity))
            self._explorer.repository.update_monitoring_state(
                telegram_id,
                monitoring_status="idle",
                last_scraped_at=scraped_at,
                last_message_id=max((message["message_id"] for message in messages), default=last_message_id),
                next_scrape_at=next_scrape_at,
                messages_collected=self._scrape_repository.get_chat_metrics(telegram_id).get("messages_stored", 0),
            )
            self._scrape_repository.update_scrape_state(
                telegram_id,
                interval_minutes=self._interval_minutes(entity),
                last_scraped_at=scraped_at,
                last_message_id=max((message["message_id"] for message in messages), default=last_message_id),
                next_scrape_at=next_scrape_at,
                monitoring_status="idle",
                last_error=None,
            )
            if self._report_agent is not None:
                try:
                    report_state = self._report_agent.update_group_memory(entity, messages, scraped_at=datetime.now(IST))
                    self._explorer.repository.update_monitoring_state(
                        telegram_id,
                        last_analysis_at=report_state.get("analysis_at"),
                        last_analysis_message_id=report_state.get("last_message_id"),
                        memory_path=report_state.get("memory"),
                        daily_report_path=report_state.get("daily"),
                        daily_pdf_path=report_state.get("daily_pdf"),
                    )
                    self._scrape_repository.update_scrape_state(
                        telegram_id,
                        last_analysis_at=report_state.get("analysis_at"),
                        last_analysis_message_id=report_state.get("last_message_id"),
                    )
                except Exception:
                    LOGGER.exception("Analysis report update failed", extra={"telegram_id": telegram_id_val})
            self._emit(
                "info",
                f"Scraping completed: {title}",
                telegram_id=telegram_id_val,
                title=title,
                messages_saved=messages_saved,
                new_messages=len(messages),
            )
            return {
                "telegram_id": telegram_id_val,
                "title": title,
                "success": True,
                "messages_saved": messages_saved,
                "new_messages": len(messages),
                "last_message_id": max((message["message_id"] for message in messages), default=last_message_id),
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "next_scrape_at": next_scrape_at.isoformat(),
            }
        except errors.FloodWaitError as exc:
            err = f"Telegram flood wait: retry after {getattr(exc, 'seconds', 'unknown')} seconds."
            LOGGER.warning("Telegram flood wait", extra={"telegram_id": telegram_id_val, "seconds": getattr(exc, "seconds", None)})
            self._explorer.repository.update_monitoring_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._scrape_repository.update_scrape_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._emit("warning", f"Scraping flood-wait: {title}", telegram_id=telegram_id_val, error=err)
            return {"telegram_id": telegram_id_val, "title": title, "success": False, "error": err}
        except errors.ChatAdminRequiredError as exc:
            err = str(exc)
            LOGGER.warning("Admin required", extra={"telegram_id": telegram_id_val})
            self._explorer.repository.update_monitoring_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._scrape_repository.update_scrape_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._emit("error", f"Scraping failed (admin required): {title}", telegram_id=telegram_id_val, error=err)
            return {"telegram_id": telegram_id_val, "title": title, "success": False, "error": err}
        except errors.ChannelPrivateError as exc:
            err = str(exc)
            LOGGER.warning("Channel private", extra={"telegram_id": telegram_id_val})
            self._explorer.repository.update_monitoring_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._scrape_repository.update_scrape_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._emit("error", f"Scraping failed (private): {title}", telegram_id=telegram_id_val, error=err)
            return {"telegram_id": telegram_id_val, "title": title, "success": False, "error": err}
        except (errors.AuthKeyError, errors.SessionPasswordNeededError) as exc:
            err = "Telegram session is invalid or requires re-authentication."
            LOGGER.warning("Session invalid", extra={"telegram_id": telegram_id_val})
            self._explorer.repository.update_monitoring_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._scrape_repository.update_scrape_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._emit("error", f"Scraping failed (auth): {title}", telegram_id=telegram_id_val, error=err)
            return {"telegram_id": telegram_id_val, "title": title, "success": False, "error": err}
        except (OSError, ConnectionError, TimeoutError) as exc:
            err = f"Network error: {exc}"
            LOGGER.warning("Network error", extra={"telegram_id": telegram_id_val, "error": str(exc)})
            self._explorer.repository.update_monitoring_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._scrape_repository.update_scrape_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._emit("error", f"Scraping failed (network): {title}", telegram_id=telegram_id_val, error=err)
            return {"telegram_id": telegram_id_val, "title": title, "success": False, "error": err}
        except ValueError as exc:
            err = str(exc)
            LOGGER.warning("Invalid entity", extra={"telegram_id": telegram_id_val, "error": err})
            self._explorer.repository.update_monitoring_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._scrape_repository.update_scrape_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._emit("error", f"Scraping failed (invalid entity): {title}", telegram_id=telegram_id_val, error=err)
            return {"telegram_id": telegram_id_val, "title": title, "success": False, "error": err}
        except Exception as exc:
            err = str(exc)
            LOGGER.exception("Telegram message collection failed", extra={"telegram_id": telegram_id_val})
            self._explorer.repository.update_monitoring_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._scrape_repository.update_scrape_state(int(entity["telegram_id"]), monitoring_status="idle", last_error=err)
            self._emit("error", f"Scraping failed: {title}", telegram_id=telegram_id_val, error=err)
            return {"telegram_id": telegram_id_val, "title": title, "success": False, "error": err}
        finally:
            if client.is_connected():
                await client.disconnect()
            if temp_dir is not None:
                temp_dir.cleanup()
