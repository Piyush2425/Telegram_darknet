import asyncio
import csv
import re
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .api.channels import router as channels_router
from .api.scraper import router as scraper_router
from .api.messages import router as messages_router
from .api.intelligence import router as intel_router
from .api.reports import router as reports_router
from .api.auth import router as auth_router
from .db.mongodb import get_db_status, store
from .scrapers.telegram_scraper import telegram_scraper
from .scrapers.scheduler import run_scheduler, stop_scheduler

logger = logging.getLogger("darknet_monitor")


def _restore_all_csv_messages():
    """Scan all data/chats/messages_*.csv files and bulk-load messages into store.messages on startup."""
    chats_dir = settings.DATA_DIR / "chats"
    if not chats_dir.exists():
        return
    loaded = 0
    for csv_path in chats_dir.glob("messages_*.csv"):
        try:
            # Derive a synthetic channel_id from the filename
            stem = csv_path.stem  # e.g. "messages_SomeName"
            channel_title = stem[len("messages_"):].replace("_", " ").strip()
            # Try to find matching channel in store
            matched_channel_id = None
            for ch_id, ch in store.channels.items():
                safe = re.sub(r"\W+", "_", (ch.get("title") or "").strip()).strip("_")[:80]
                if safe == stem[len("messages_"):]:
                    matched_channel_id = ch_id
                    channel_title = ch.get("title", channel_title)
                    break
            ch_id_to_use = matched_channel_id or f"csv_{stem}"

            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                rows = list(reader)
            if len(rows) <= 1:
                continue
            for r in rows[1:]:
                if len(r) >= 6:
                    msg_id = r[0]
                    if msg_id not in store.messages:
                        store.messages[msg_id] = {
                            "id": msg_id,
                            "channel_id": ch_id_to_use,
                            "channel_username": channel_title,
                            "sender": r[2],
                            "text": r[3],
                            "date": r[1],
                            "views": int(r[4]) if r[4].isdigit() else 10,
                            "media_url": None,
                            "threat_level": r[5] if r[5] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"] else "LOW",
                            "analyzed": True
                        }
                        loaded += 1
        except Exception as e:
            logger.warning(f"CSV restore failed for {csv_path.name}: {e}")
    if loaded:
        logger.info(f"✓ Restored {loaded} messages from local CSV files into memory store.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """On startup: if Telegram session exists and user is authorized, auto-sync all channels."""
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"TELEGRAM_API_ID = {settings.TELEGRAM_API_ID}")
    logger.info(f"TELEGRAM_API_HASH = {'*' * 6 + settings.TELEGRAM_API_HASH[-4:] if settings.TELEGRAM_API_HASH else 'NOT SET'}")

    # Restore all persisted CSV messages into memory first (before channel sync)
    _restore_all_csv_messages()

    # Auto-sync channels if user session is already saved
    try:
        auth_status = await telegram_scraper.check_auth_status()
        if auth_status.get("is_authorized"):
            user = auth_status.get("user", {})
            username = user.get("username") or user.get("first_name") or "User"
            logger.info(f"✓ Telegram session active — logged in as @{username}. Auto-syncing channels...")
            channels = await telegram_scraper.sync_user_dialogs()
            logger.info(f"✓ Auto-imported {len(channels)} real channels/groups from Telegram account.")
            # Re-run restore to pick up any channel_id matches now that channels are loaded
            _restore_all_csv_messages()
        else:
            logger.info(f"No active Telegram session. Please authenticate via Settings page.")
    except Exception as e:
        logger.warning(f"Auto-sync skipped: {e}")

    # Start the automated target channel scheduler in background!
    asyncio.create_task(run_scheduler())
    
    yield
    
    # ON SHUTDOWN: Disconnect persistent Telethon client cleanly to release SQLite lock
    try:
        stop_scheduler()
        if telegram_scraper.client:
            logger.info("Shutting down: Disconnecting persistent Telethon client...")
            await telegram_scraper.client.disconnect()
            logger.info("✓ Telethon client disconnected cleanly.")
    except Exception as e:
        logger.warning(f"Error disconnecting Telethon client on shutdown: {e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Cyber Threat Intelligence (CTI) Backend API for Telegram Darknet Channel Monitoring & LLM Threat Analysis.",
    lifespan=lifespan
)

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(channels_router, prefix="/api")
app.include_router(scraper_router, prefix="/api")
app.include_router(messages_router, prefix="/api")
app.include_router(intel_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(auth_router, prefix="/api")

@app.get("/api/notifications")
async def get_notifications():
    """Retrieve running historical notifications list."""
    from .db.mongodb import store
    return store.notifications

@app.post("/api/notifications/read-all")
async def mark_notifications_read():
    """Mark all notifications as read."""
    from .db.mongodb import store
    for n in store.notifications:
        n["read"] = True
    return {"status": "marked_read"}

@app.get("/api/health")
async def health_check():
    db_status = await get_db_status()
    return {
        "status": "online",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": db_status
    }
