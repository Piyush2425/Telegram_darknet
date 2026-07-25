"""Persistence for scheduled Telegram message collection.

Purpose:
    Store Telegram message snapshots in MongoDB and CSV files.
Responsibilities:
    Keep a shared Telegram message collection, export group-specific CSV files,
    and avoid duplicate messages across scheduler runs.
Dependencies:
    PyMongo for persistence and the Python standard library for CSV exports.
"""

from __future__ import annotations

import base64
import csv
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

from pymongo import ASCENDING, MongoClient, UpdateOne
from pymongo.collection import Collection

LOGGER = logging.getLogger(__name__)


class ScrapeRepositoryError(RuntimeError):
    """Indicate that scheduled scrape persistence failed."""


class TelegramGroupScrapeRepository:
    """Persist scheduled Telegram message collection results."""

    def __init__(
        self,
        mongo_uri: str,
        database_name: str,
        csv_root: Path,
        client: MongoClient[Mapping[str, Any]] | None = None,
    ) -> None:
        """Initialize the repository.

        Args:
            mongo_uri: MongoDB connection URI.
            database_name: MongoDB database used for scrape collections.
            csv_root: Directory where per-group CSV snapshots are written.
            client: Optional injected Mongo client for tests.
        """
        try:
            self._client = client or MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
            self._database = self._client[database_name]
            self._state_collection = self._database["telegram_scrape_state"]
            self._messages = self._database["telegram_messages"]
            self._csv_root = csv_root
            self._state_collection.create_index([("telegram_id", ASCENDING)], unique=True)
            self._messages.create_index([("chat_id", ASCENDING), ("message_id", ASCENDING)], unique=True)
            self._messages.create_index([("chat_id", ASCENDING), ("message_date", ASCENDING)])
            self._messages.create_index([("created_at", ASCENDING)])
            self._messages.create_index([("message_id", ASCENDING)])
        except Exception as exc:
            raise ScrapeRepositoryError(f"Unable to initialize MongoDB: {exc}") from exc

    def _messages_collection(self, telegram_id: int) -> Collection[Mapping[str, Any]]:
        """Return the shared message collection.

        The ``telegram_id`` argument is retained for compatibility with the
        existing repository boundary.
        """
        return self._messages

    def ensure_storage_directories(self) -> None:
        """Create CSV and media directories used by the storage service."""
        self._csv_root.mkdir(parents=True, exist_ok=True)
        (self._csv_root.parent / "media").mkdir(parents=True, exist_ok=True)

    def get_message_checkpoint(self, telegram_id: int) -> int | None:
        """Return the newest stored message ID for a Telegram group."""
        try:
            document = self._state_collection.find_one(
                {"telegram_id": telegram_id}, {"_id": False, "last_message_id": True}
            )
            if not document:
                return None
            value = document.get("last_message_id")
            return int(value) if value is not None else None
        except Exception as exc:
            raise ScrapeRepositoryError(
                f"Unable to load message checkpoint for {telegram_id}: {exc}"
            ) from exc

    def save_message_checkpoint(
        self,
        telegram_id: int,
        last_message_id: int,
        scraped_at: datetime | None = None,
    ) -> None:
        """Store the newest scraped message ID for a Telegram group."""
        try:
            self._state_collection.update_one(
                {"telegram_id": telegram_id},
                {
                    "$set": {
                        "telegram_id": telegram_id,
                        "last_message_id": last_message_id,
                        "last_scraped_at": scraped_at or datetime.now(timezone.utc),
                    }
                },
                upsert=True,
            )
        except Exception as exc:
            raise ScrapeRepositoryError(
                f"Unable to save message checkpoint for {telegram_id}: {exc}"
            ) from exc

    def get_oldest_message_checkpoint(self, telegram_id: int) -> int | None:
        """Return the oldest stored message ID for a Telegram group."""
        try:
            document = self._state_collection.find_one(
                {"telegram_id": telegram_id}, {"_id": False, "oldest_message_id": True}
            )
            if not document:
                return None
            value = document.get("oldest_message_id")
            return int(value) if value is not None else None
        except Exception as exc:
            raise ScrapeRepositoryError(
                f"Unable to load oldest message checkpoint for {telegram_id}: {exc}"
            ) from exc

    def save_oldest_message_checkpoint(
        self,
        telegram_id: int,
        oldest_message_id: int,
    ) -> None:
        """Store the oldest scraped message ID for a Telegram group."""
        try:
            self._state_collection.update_one(
                {"telegram_id": telegram_id},
                {
                    "$set": {
                        "oldest_message_id": oldest_message_id,
                    }
                },
                upsert=True,
            )
        except Exception as exc:
            raise ScrapeRepositoryError(
                f"Unable to save oldest message checkpoint for {telegram_id}: {exc}"
            ) from exc


    def update_scrape_state(self, telegram_id: int, **fields: Any) -> dict[str, Any]:
        """Persist per-group scrape and analysis metadata."""
        payload = {key: value for key, value in fields.items() if value is not None}
        payload["telegram_id"] = int(telegram_id)
        payload.setdefault("updated_at", datetime.now(timezone.utc))
        try:
            self._state_collection.update_one(
                {"telegram_id": int(telegram_id)},
                {"$set": payload},
                upsert=True,
            )
            document = self._state_collection.find_one(
                {"telegram_id": int(telegram_id)}, {"_id": False}
            )
            return dict(document) if document else payload
        except Exception as exc:
            raise ScrapeRepositoryError(
                f"Unable to update scrape state for {telegram_id}: {exc}"
            ) from exc

    @staticmethod
    def _serialize_value(value: Any) -> Any:
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False, default=str)
        return value

    @staticmethod
    def _sanitize_json(value: Any) -> Any:
        """Recursively convert bytes into JSON-safe values."""
        if isinstance(value, bytes):
            return {"__bytes__": base64.b64encode(value).decode("ascii")}
        if isinstance(value, dict):
            return {key: TelegramGroupScrapeRepository._sanitize_json(val) for key, val in value.items()}
        if isinstance(value, list):
            return [TelegramGroupScrapeRepository._sanitize_json(val) for val in value]
        if isinstance(value, tuple):
            return [TelegramGroupScrapeRepository._sanitize_json(val) for val in value]
        if isinstance(value, datetime):
            return value.isoformat()
        return value

    def _group_csv_directory(self, telegram_id: int, title: str | None) -> Path:
        safe_title = "".join(character if character.isalnum() or character in ("-", "_") else "_" for character in (title or "group")).strip("_")
        if not safe_title:
            safe_title = str(telegram_id)
        return self._csv_root / safe_title

    def save_messages(
        self,
        entity: Mapping[str, Any],
        messages: Iterable[Mapping[str, Any]],
        scraped_at: datetime | None = None,
    ) -> int:
        """Persist newly collected messages for a chat and export a CSV snapshot."""
        telegram_id = int(entity["telegram_id"])
        documents = list(messages)
        if not documents:
            return 0

        scraped_at = scraped_at or datetime.now(timezone.utc)
        collection = self._messages_collection(telegram_id)
        operations = []
        for document in documents:
            mutable = dict(document)
            mutable.setdefault("chat_id", telegram_id)
            mutable.setdefault("chat_name", entity.get("title") or entity.get("username"))
            mutable.setdefault("created_at", scraped_at)
            operations.append(
                UpdateOne(
                    {"chat_id": mutable["chat_id"], "message_id": mutable["message_id"]},
                    {"$setOnInsert": mutable},
                    upsert=True,
                )
            )

        try:
            result = collection.bulk_write(operations, ordered=False)
            self.export_messages_csv(entity, scraped_at=scraped_at)
            return int(result.upserted_count)
        except Exception as exc:
            raise ScrapeRepositoryError(f"Unable to save messages for {telegram_id}: {exc}") from exc

    def list_messages(self, telegram_id: int) -> list[dict[str, Any]]:
        """Return all stored messages for a Telegram chat."""
        try:
            return [
                self._sanitize_json(dict(document))
                for document in self._messages_collection(telegram_id)
                .find({"chat_id": telegram_id}, {"_id": False})
                .sort([("message_id", ASCENDING)])
            ]
        except Exception as exc:
            raise ScrapeRepositoryError(
                f"Unable to load messages for {telegram_id}: {exc}"
            ) from exc

    def list_messages_between(
        self,
        telegram_id: int,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Return stored messages for a Telegram chat within an optional UTC range."""
        try:
            query: dict[str, Any] = {"chat_id": int(telegram_id)}
            created_at: dict[str, Any] = {}
            if start is not None:
                created_at["$gte"] = start
            if end is not None:
                created_at["$lt"] = end
            if created_at:
                query["created_at"] = created_at
            return [
                self._sanitize_json(dict(document))
                for document in self._messages_collection(telegram_id)
                .find(query, {"_id": False})
                .sort([("created_at", ASCENDING), ("message_id", ASCENDING)])
            ]
        except Exception as exc:
            raise ScrapeRepositoryError(
                f"Unable to load message window for {telegram_id}: {exc}"
            ) from exc

    def list_messages_since(
        self,
        telegram_id: int,
        start: datetime,
        end: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Return stored messages for a Telegram chat after a start timestamp."""
        return self.list_messages_between(telegram_id, start=start, end=end)

    def export_messages_csv(
        self,
        entity: Mapping[str, Any],
        messages: Iterable[Mapping[str, Any]] | None = None,
        scraped_at: datetime | None = None,
    ) -> Path:
        """Write a per-chat CSV snapshot of collected messages."""
        scraped_at = scraped_at or datetime.now(timezone.utc)
        directory = self._group_csv_directory(int(entity["telegram_id"]), entity.get("title"))
        directory.mkdir(parents=True, exist_ok=True)
        csv_path = directory / "messages.csv"
        temporary_path = csv_path.with_suffix(".csv.tmp")
        fields = [
            "message_id",
            "chat_id",
            "chat_name",
            "sender",
            "sender_id",
            "sender_username",
            "sender_name",
            "text",
            "message_text",
            "raw_message",
            "date",
            "message_date",
            "media_type",
            "media",
            "reply_to",
            "forward_from",
            "hashtags",
            "mentions",
            "urls",
            "created_at",
        ]
        try:
            rows = self.list_messages(int(entity["telegram_id"])) if messages is None else list(messages)
            with temporary_path.open("w", newline="", encoding="utf-8-sig") as output:
                writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
                writer.writeheader()
                for message in rows:
                    row = dict(message)
                    row.setdefault("chat_id", int(entity["telegram_id"]))
                    row.setdefault("chat_name", entity.get("title") or entity.get("username"))
                    row.setdefault("created_at", scraped_at)
                    writer.writerow({key: self._serialize_value(value) for key, value in row.items()})
            temporary_path.replace(csv_path)
            return csv_path
        except Exception as exc:
            raise ScrapeRepositoryError(f"Unable to export messages CSV for {entity.get('telegram_id')}: {exc}") from exc

    def get_chat_metrics(self, telegram_id: int) -> dict[str, Any]:
        """Return persisted message metrics for one Telegram chat."""
        try:
            state = self._state_collection.find_one(
                {"telegram_id": int(telegram_id)},
                {
                    "_id": False,
                    "last_scraped_at": True,
                    "last_message_id": True,
                    "last_analysis_at": True,
                    "last_analysis_message_id": True,
                    "next_scrape_at": True,
                    "interval_minutes": True,
                    "monitoring_status": True,
                    "last_error": True,
                },
            ) or {}
            return {
                "messages_stored": self._messages.count_documents({"chat_id": int(telegram_id)}),
                "last_scraped": state.get("last_scraped_at"),
                "last_message_id": state.get("last_message_id"),
                "last_analysis_at": state.get("last_analysis_at"),
                "last_analysis_message_id": state.get("last_analysis_message_id"),
                "next_scrape_at": state.get("next_scrape_at"),
                "interval_minutes": state.get("interval_minutes"),
                "monitoring_status": state.get("monitoring_status"),
                "last_error": state.get("last_error"),
            }
        except Exception as exc:
            raise ScrapeRepositoryError(
                f"Unable to load message metrics for {telegram_id}: {exc}"
            ) from exc

    def get_chat_metrics_map(self, telegram_ids: Iterable[int]) -> dict[int, dict[str, Any]]:
        """Return message metrics keyed by Telegram chat ID."""
        identifiers = [int(identifier) for identifier in telegram_ids]
        if not identifiers:
            return {}
        try:
            counts = {
                int(row["_id"]): int(row["count"])
                for row in self._messages.aggregate(
                    [
                        {"$match": {"chat_id": {"$in": identifiers}}},
                        {"$group": {"_id": "$chat_id", "count": {"$sum": 1}}},
                    ]
                )
            }
            states = {
                int(row["telegram_id"]): row
                for row in self._state_collection.find(
                    {"telegram_id": {"$in": identifiers}},
                    {
                        "_id": False,
                        "telegram_id": True,
                        "last_scraped_at": True,
                        "last_message_id": True,
                        "last_analysis_at": True,
                        "last_analysis_message_id": True,
                        "next_scrape_at": True,
                        "interval_minutes": True,
                        "monitoring_status": True,
                        "last_error": True,
                    },
                )
            }
            return {
                identifier: {
                    "messages_stored": counts.get(identifier, 0),
                    "last_scraped": states.get(identifier, {}).get("last_scraped_at"),
                    "last_message_id": states.get(identifier, {}).get("last_message_id"),
                    "last_analysis_at": states.get(identifier, {}).get("last_analysis_at"),
                    "last_analysis_message_id": states.get(identifier, {}).get("last_analysis_message_id"),
                    "next_scrape_at": states.get(identifier, {}).get("next_scrape_at"),
                    "interval_minutes": states.get(identifier, {}).get("interval_minutes"),
                    "monitoring_status": states.get(identifier, {}).get("monitoring_status"),
                    "last_error": states.get(identifier, {}).get("last_error"),
                }
                for identifier in identifiers
            }
        except Exception as exc:
            raise ScrapeRepositoryError(f"Unable to load chat metrics: {exc}") from exc

    def get_dashboard_stats(self) -> dict[str, Any]:
        """Return aggregate storage statistics for the dashboard."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        try:
            return {
                "total_messages": self._messages.count_documents({}),
                "messages_collected_today": self._messages.count_documents(
                    {"created_at": {"$gte": today_start}}
                ),
            }
        except Exception as exc:
            raise ScrapeRepositoryError(f"Unable to load dashboard stats: {exc}") from exc

    def query_messages(
        self,
        page: int = 1,
        page_size: int = 50,
        search: str = "",
        sort_by: str = "message_date",
        sort_order: str = "desc",
        chat_id: int | None = None,
    ) -> dict[str, Any]:
        """Return a paginated search result for stored Telegram messages."""
        try:
            page = max(int(page), 1)
            page_size = min(max(int(page_size), 1), 200)
            skip = (page - 1) * page_size
            query: dict[str, Any] = {}
            filters: list[dict[str, Any]] = []
            if search.strip():
                escaped = re.escape(search.strip())
                filters.append(
                    {
                        "$or": [
                            {"text": {"$regex": escaped, "$options": "i"}},
                            {"message_text": {"$regex": escaped, "$options": "i"}},
                            {"chat_name": {"$regex": escaped, "$options": "i"}},
                            {"sender_name": {"$regex": escaped, "$options": "i"}},
                            {"sender_username": {"$regex": escaped, "$options": "i"}},
                        ]
                    }
                )
            if chat_id is not None:
                filters.append({"chat_id": int(chat_id)})
            if filters:
                query = {"$and": filters} if len(filters) > 1 else filters[0]

            sort_field = sort_by if sort_by in {
                "message_id",
                "chat_id",
                "chat_name",
                "sender_name",
                "sender_username",
                "message_date",
                "date",
                "created_at",
            } else "message_date"
            direction = ASCENDING if str(sort_order).lower() == "asc" else -1
            cursor = self._messages.find(query, {"_id": False}).sort([(sort_field, direction)])
            total = self._messages.count_documents(query)
            rows = [self._sanitize_json(dict(document)) for document in cursor.skip(skip).limit(page_size)]
            return {
                "items": rows,
                "page": page,
                "page_size": page_size,
                "total": total,
            }
        except Exception as exc:
            raise ScrapeRepositoryError(f"Unable to query Telegram messages: {exc}") from exc

    def get_latest_message(self) -> dict[str, Any] | None:
        """Return the most recently created stored message."""
        try:
            document = self._messages.find_one({}, {"_id": False}, sort=[("created_at", -1), ("message_date", -1), ("date", -1)])
            return self._sanitize_json(dict(document)) if document else None
        except Exception as exc:
            raise ScrapeRepositoryError(f"Unable to load latest message: {exc}") from exc

    def get_new_messages_since(self, telegram_id: int, since: datetime) -> int:
        """Return the number of messages for a chat inserted after *since*."""
        try:
            return int(self._messages.count_documents(
                {"chat_id": int(telegram_id), "created_at": {"$gt": since}}
            ))
        except Exception as exc:
            raise ScrapeRepositoryError(
                f"Unable to count new messages for {telegram_id}: {exc}"
            ) from exc

    def get_per_entity_stats(self) -> list[dict[str, Any]]:
        """Return per-entity scrape state and message counts in a single query.

        Returns a list of dicts with telegram_id, messages_stored, last_scraped_at,
        last_message_id, new_messages (since last scrape).
        """
        try:
            # Aggregate message counts per chat
            counts: dict[int, int] = {
                int(row["_id"]): int(row["count"])
                for row in self._messages.aggregate(
                    [{"$group": {"_id": "$chat_id", "count": {"$sum": 1}}}]
                )
            }
            # Load all scrape state documents
            states = {
                int(row["telegram_id"]): row
                for row in self._state_collection.find({}, {"_id": False})
            }
            all_ids = set(counts.keys()) | set(states.keys())
            result = []
            for tid in all_ids:
                state = states.get(tid, {})
                last_scraped = state.get("last_scraped_at")
                # Count messages newer than last_scraped_at to detect new messages
                new_msgs = 0
                if last_scraped is not None:
                    since_dt = last_scraped if isinstance(last_scraped, datetime) else datetime.fromisoformat(str(last_scraped))
                    try:
                        new_msgs = int(self._messages.count_documents(
                            {"chat_id": tid, "created_at": {"$gt": since_dt}}
                        ))
                    except Exception:
                        new_msgs = 0
                result.append({
                    "telegram_id": tid,
                    "messages_stored": counts.get(tid, 0),
                    "last_scraped_at": last_scraped.isoformat() if isinstance(last_scraped, datetime) else last_scraped,
                    "last_message_id": state.get("last_message_id"),
                    "new_messages": new_msgs,
                })
            return result
        except Exception as exc:
            raise ScrapeRepositoryError(f"Unable to load per-entity stats: {exc}") from exc

    def delete_message(self, message_id: int) -> bool:
        """Delete one message by its Telegram message_id. Returns True if deleted."""
        try:
            result = self._messages.delete_one({"message_id": int(message_id)})
            return result.deleted_count > 0
        except Exception as exc:
            raise ScrapeRepositoryError(f"Unable to delete message {message_id}: {exc}") from exc
