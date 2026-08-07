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

# Motor client is lazily initialized; real connection is verified in lifespan via ping.
mongo_available = False
db_client = None
db = None

try:
    from motor.motor_asyncio import AsyncIOMotorClient
    _motor_client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=3000)
    db = _motor_client[settings.DATABASE_NAME]
except Exception:
    _motor_client = None

async def connect_to_mongo() -> bool:
    """Ping MongoDB and log the result. Returns True if connected."""
    global mongo_available
    if _motor_client is None:
        logger.error("❌ MongoDB driver (motor) not available. Check requirements.txt.")
        return False
    try:
        await _motor_client.admin.command("ping")
        mongo_available = True
        logger.info(f"✅ MongoDB connected successfully → {settings.MONGODB_URL} (db: {settings.DATABASE_NAME})")
        await init_db_indexes()
        return True
    except Exception as e:
        mongo_available = False
        logger.warning(f"⚠️  MongoDB connection failed: {e}. Running in In-Memory mode (CSV storage only).")
        return False

async def get_db_status():
    return {
        "mongo_connected": mongo_available,
        "database_name": settings.DATABASE_NAME,
        "url": settings.MONGODB_URL,
        "mode": "MongoDB" if mongo_available else "In-Memory Store (CSV)"
    }

async def init_db_indexes():
    """Create MongoDB indexes for fast search and filtering."""
    if not mongo_available or db is None:
        return
    try:
        from pymongo import ASCENDING, DESCENDING, TEXT
        # Messages collection indexes
        await db.messages.create_index([("id", ASCENDING)], unique=True)
        await db.messages.create_index([("channel_id", ASCENDING), ("date", DESCENDING)])
        await db.messages.create_index([("date", DESCENDING)])
        # Text index for global search
        await db.messages.create_index([("text", TEXT)], default_language="english")
        logger.info("✅ MongoDB indexes initialized (including $text and date search).")
    except Exception as e:
        logger.warning(f"⚠️ Failed to initialize MongoDB indexes: {e}")
