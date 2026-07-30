import logging
import re
from pathlib import Path
from typing import Dict, List, Any, Optional
from ..config import settings

logger = logging.getLogger("darknet_monitor.db")

def get_channel_dir(channel_id: str, channel_title: str = "") -> Path:
    """Return the base folder for a channel: data/{safe_title}/ if title is known/given, else data/{channel_id}/."""
    def safe_name(s: str) -> str:
        s = re.sub(r"\W+", "_", (s or "").strip())
        s = s.strip("_")
        return s[:80] if s else "target"

    title = channel_title
    if not title:
        ch = store.channels.get(channel_id, {})
        title = ch.get("title", "")

    if title:
        return settings.DATA_DIR / safe_name(title)
    return settings.DATA_DIR / channel_id


class InMemoryStore:
    """In-memory database store. Channels are populated from real Telegram account after login."""
    def __init__(self):
        self.channels: Dict[str, dict] = {}
        self.messages: Dict[str, dict] = {}
        self.threat_intel: Dict[str, dict] = {}
        self.reports: Dict[str, dict] = {}
        self.notifications: List[dict] = []

    def add_notification(self, type_str: str, message: str):
        import datetime
        from datetime import timezone, timedelta
        IST = timezone(timedelta(hours=5, minutes=30))
        now_str = datetime.datetime.now(IST).strftime("%H:%M:%S")
        self.notifications.insert(0, {
            "id": f"notif_{len(self.notifications) + 1}",
            "timestamp": now_str,
            "type": type_str,
            "message": message,
            "read": False
        })
        if len(self.notifications) > 50:
            self.notifications = self.notifications[:50]

store = InMemoryStore()

# Try initializing Motor MongoDB Client
mongo_available = False
db_client = None

try:
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=2000)
    db = client[settings.DATABASE_NAME]
    mongo_available = True
except Exception as e:
    logger.warning(f"MongoDB not connected: {e}. Using in-memory database store.")
    mongo_available = False

async def get_db_status():
    return {
        "mongo_connected": mongo_available,
        "database_name": settings.DATABASE_NAME,
        "mode": "MongoDB" if mongo_available else "In-Memory Store"
    }
