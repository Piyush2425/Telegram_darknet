"""Telegram entity discovery package.

Purpose:
    Exposes the persistence and discovery components used by Telegram Explorer.
Responsibilities:
    Keeps Telegram API access separate from storage and presentation concerns.
Dependencies:
    Telethon and PyMongo through the concrete modules in this package.
"""

from .entity_repository import MongoEntityRepository
from .entity_service import TelegramEntityService

__all__ = ["MongoEntityRepository", "TelegramEntityService"]
