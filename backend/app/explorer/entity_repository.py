"""MongoDB persistence for discovered Telegram entities.

Purpose:
    Maintains the canonical ``telegram_entities`` collection and CSV snapshot.
Responsibilities:
    Create indexes, upsert discoveries without overwriting monitoring choices,
    query entities, and update enabled states in bulk.
Dependencies:
    PyMongo for persistence and the Python CSV standard library for exports.
"""

from __future__ import annotations

import csv
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

from pymongo import ASCENDING, MongoClient, UpdateOne
from pymongo.collection import Collection

LOGGER = logging.getLogger(__name__)


class EntityRepositoryError(RuntimeError):
    """Indicate that a Telegram entity persistence operation failed."""


class MongoEntityRepository:
    """Store and retrieve discovered Telegram entities in MongoDB.

    The repository owns persistence details so discovery and UI code remain
    independent of PyMongo. Monitoring selections survive later discoveries
    because refresh upserts deliberately do not replace ``enabled``.
    """

    def __init__(
        self,
        mongo_uri: str,
        database_name: str,
        csv_path: Path,
        client: MongoClient[Mapping[str, Any]] | None = None,
    ) -> None:
        """Initialize the repository and ensure its unique Telegram ID index.

        Args:
            mongo_uri: MongoDB connection URI.
            database_name: Database containing ``telegram_entities``.
            csv_path: Destination for the latest complete entity snapshot.
            client: Optional injected client, primarily for testing.

        Raises:
            EntityRepositoryError: If MongoDB cannot be initialized.
        """
        try:
            self._client = client or MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
            self._collection: Collection[Mapping[str, Any]] = self._client[
                database_name
            ]["telegram_entities"]
            self._collection.create_index(
                [("telegram_id", ASCENDING)], unique=True, name="telegram_id_unique"
            )
            self._collection.create_index(
                [("enabled", ASCENDING)], name="enabled_lookup"
            )
            self._csv_path = csv_path
        except Exception as exc:
            raise EntityRepositoryError(f"Unable to initialize MongoDB: {exc}") from exc

    def upsert_discovered(self, entities: Iterable[Mapping[str, Any]]) -> int:
        """Insert new discoveries and update existing records without duplicates.

        Args:
            entities: Normalized Telegram entity documents.

        Returns:
            Number of input entities submitted for upsert.

        Raises:
            EntityRepositoryError: If MongoDB or CSV persistence fails.
        """
        documents = list(entities)
        if not documents:
            self.export_csv()
            return 0

        now = datetime.now(timezone.utc)
        operations = []
        for entity in documents:
            mutable = dict(entity)
            mutable["updated_at"] = now
            mutable.setdefault("interval_minutes", 60)
            operations.append(
                UpdateOne(
                    {"telegram_id": mutable["telegram_id"]},
                    {
                        "$set": mutable,
                        "$setOnInsert": {"enabled": False, "created_at": now},
                    },
                    upsert=True,
                )
            )
        try:
            self._collection.bulk_write(operations, ordered=False)
            self.export_csv()
            LOGGER.info("Entities saved", extra={"entity_count": len(documents)})
            return len(documents)
        except Exception as exc:
            raise EntityRepositoryError(f"Unable to save Telegram entities: {exc}") from exc

    def list_entities(self, search: str = "") -> list[dict[str, Any]]:
        """Return entities sorted by title, optionally filtered by name or username.

        Args:
            search: Case-insensitive literal search fragment.

        Returns:
            Serializable MongoDB documents without internal object IDs.

        Raises:
            EntityRepositoryError: If the query fails.
        """
        query: dict[str, Any] = {}
        if search.strip():
            escaped = __import__("re").escape(search.strip())
            query = {
                "$or": [
                    {"title": {"$regex": escaped, "$options": "i"}},
                    {"username": {"$regex": escaped, "$options": "i"}},
                ]
            }
        try:
            return [
                dict(document)
                for document in self._collection.find(query, {"_id": False}).sort(
                    [("title", ASCENDING)]
                )
            ]
        except Exception as exc:
            raise EntityRepositoryError(f"Unable to load Telegram entities: {exc}") from exc

    def get_entity(self, telegram_id: int) -> dict[str, Any] | None:
        """Return one discovered Telegram entity by ID.

        Args:
            telegram_id: Telegram chat/channel identifier.

        Returns:
            The persisted entity document, or ``None`` when unknown.

        Raises:
            EntityRepositoryError: If MongoDB lookup fails.
        """
        try:
            document = self._collection.find_one(
                {"telegram_id": int(telegram_id)}, {"_id": False}
            )
            return dict(document) if document else None
        except Exception as exc:
            raise EntityRepositoryError(
                f"Unable to load Telegram entity {telegram_id}: {exc}"
            ) from exc

    def set_enabled(self, telegram_ids: Iterable[int], enabled: bool) -> int:
        """Set monitoring state for the supplied Telegram IDs.

        Args:
            telegram_ids: Entity identifiers to modify.
            enabled: Desired future monitoring state.

        Returns:
            Number of records whose state changed.

        Raises:
            EntityRepositoryError: If the update fails.
        """
        identifiers = list(dict.fromkeys(telegram_ids))
        if not identifiers:
            return 0
        try:
            result = self._collection.update_many(
                {"telegram_id": {"$in": identifiers}},
                {
                    "$set": {
                        "enabled": enabled,
                        "monitoring_status": "idle" if enabled else "stopped",
                        "monitoring_enabled_at": datetime.now(timezone.utc) if enabled else None,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
            self.export_csv()
            return result.modified_count
        except Exception as exc:
            raise EntityRepositoryError(
                f"Unable to update monitoring selection: {exc}"
            ) from exc

    def set_interval_minutes(self, telegram_id: int, interval_minutes: int) -> dict[str, Any]:
        """Persist the monitoring interval for one entity."""
        try:
            interval = max(int(interval_minutes), 1)
        except (TypeError, ValueError) as exc:
            raise EntityRepositoryError("Interval must be an integer") from exc
        try:
            self._collection.update_one(
                {"telegram_id": int(telegram_id)},
                {
                    "$set": {
                        "interval_minutes": interval,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
            document = self.get_entity(int(telegram_id))
            self.export_csv()
            return document or {"telegram_id": int(telegram_id), "interval_minutes": interval}
        except Exception as exc:
            raise EntityRepositoryError(
                f"Unable to update monitoring interval for {telegram_id}: {exc}"
            ) from exc

    def update_monitoring_state(self, telegram_id: int, **fields: Any) -> dict[str, Any]:
        """Update per-entity monitoring metadata without touching discovery fields."""
        payload = {key: value for key, value in fields.items() if value is not None}
        payload["updated_at"] = datetime.now(timezone.utc)
        try:
            self._collection.update_one(
                {"telegram_id": int(telegram_id)},
                {"$set": payload},
            )
            document = self.get_entity(int(telegram_id))
            self.export_csv()
            return document or {"telegram_id": int(telegram_id), **payload}
        except Exception as exc:
            raise EntityRepositoryError(
                f"Unable to update monitoring state for {telegram_id}: {exc}"
            ) from exc

    def get_monitoring_overview(self) -> list[dict[str, Any]]:
        """Return discovered entities with monitoring metadata."""
        try:
            return [
                dict(document)
                for document in self._collection.find({}, {"_id": False}).sort([("title", ASCENDING)])
            ]
        except Exception as exc:
            raise EntityRepositoryError(f"Unable to load monitoring overview: {exc}") from exc

    def replace_enabled_selection(self, telegram_ids: Iterable[int]) -> int:
        """Persist an exact enabled selection across all discovered entities.

        Args:
            telegram_ids: IDs that should remain enabled; all others are disabled.

        Returns:
            Total number of records modified.

        Raises:
            EntityRepositoryError: If either bulk update fails.
        """
        identifiers = list(dict.fromkeys(telegram_ids))
        now = datetime.now(timezone.utc)
        try:
            disabled = self._collection.update_many(
                {"enabled": True, "telegram_id": {"$nin": identifiers}},
                {"$set": {"enabled": False, "updated_at": now}},
            )
            enabled = self._collection.update_many(
                {"telegram_id": {"$in": identifiers}, "enabled": {"$ne": True}},
                {"$set": {"enabled": True, "updated_at": now}},
            )
            self.export_csv()
            return disabled.modified_count + enabled.modified_count
        except Exception as exc:
            raise EntityRepositoryError(
                f"Unable to save monitoring selection: {exc}"
            ) from exc

    def list_enabled(self) -> list[dict[str, Any]]:
        """Return entities configured for the future Telegram Monitor.

        Returns:
            Enabled entity documents sorted by title.
        """
        try:
            return [
                dict(document)
                for document in self._collection.find(
                    {"enabled": True}, {"_id": False}
                ).sort([("title", ASCENDING)])
            ]
        except Exception as exc:
            raise EntityRepositoryError(
                f"Unable to load enabled Telegram entities: {exc}"
            ) from exc

    def delete_entity(self, telegram_id: int) -> int:
        """Remove a Telegram entity from persistence."""
        try:
            result = self._collection.delete_one({"telegram_id": int(telegram_id)})
            if result.deleted_count:
                self.export_csv()
            return int(result.deleted_count)
        except Exception as exc:
            raise EntityRepositoryError(
                f"Unable to delete Telegram entity {telegram_id}: {exc}"
            ) from exc

    def export_csv(self) -> Path:
        """Write an atomic CSV snapshot of every persisted Telegram entity.

        Returns:
            Path to the generated snapshot.

        Raises:
            EntityRepositoryError: If the export cannot be completed.
        """
        fields = [
            "telegram_id",
            "title",
            "username",
            "type",
            "is_private",
            "participants_count",
            "enabled",
            "last_synced",
            "created_at",
            "updated_at",
        ]
        temporary_path = self._csv_path.with_suffix(f"{self._csv_path.suffix}.tmp")
        try:
            self._csv_path.parent.mkdir(parents=True, exist_ok=True)
            rows = self.list_entities()
            with temporary_path.open("w", newline="", encoding="utf-8-sig") as output:
                writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
                writer.writeheader()
                for row in rows:
                    writer.writerow(
                        {
                            key: value.isoformat()
                            if isinstance(value, datetime)
                            else value
                            for key, value in row.items()
                        }
                    )
            temporary_path.replace(self._csv_path)
            return self._csv_path
        except EntityRepositoryError:
            raise
        except Exception as exc:
            raise EntityRepositoryError(f"Unable to export entity CSV: {exc}") from exc
