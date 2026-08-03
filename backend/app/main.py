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
from .db.mongodb import get_db_status, store, connect_to_mongo
from .scrapers.telegram_scraper import telegram_scraper
from .scrapers.scheduler import run_scheduler, stop_scheduler

logger = logging.getLogger("darknet_monitor")


def _migrate_numeric_folders_to_titles():
    """Migrate old numeric channel ID folders to new safe channel title folders if titles are available."""
    data_dir = settings.DATA_DIR
    if not data_dir.exists():
        return
    migrated = 0
    for ch_id, ch in list(store.channels.items()):
        old_dir = data_dir / ch_id
        if old_dir.exists() and old_dir.is_dir():
            title = ch.get("title", "")
            if title:
                safe_title = re.sub(r"\W+", "_", title.strip()).strip("_")[:80]
                if safe_title and safe_title != ch_id:
                    new_dir = data_dir / safe_title
                    if not new_dir.exists():
                        try:
                            old_dir.rename(new_dir)
                            logger.info(f"📁 Migrated channel folder structure: {ch_id} → {safe_title}")
                            migrated += 1
                        except Exception as e:
                            logger.warning(f"Failed to migrate folder {ch_id} to {safe_title}: {e}")
    if migrated:
        logger.info(f"✓ Successfully migrated {migrated} channel folders to title-based naming.")


async def _migrate_csv_messages_to_db():
    """Scan all data/{channel_dir}/chats/messages_*.csv files and migrate them into MongoDB."""
    from .db.mongodb import db, mongo_available
    data_dir = settings.DATA_DIR
    if not data_dir.exists():
        return
        
    loaded = 0
    migrated_to_db = 0
    from pymongo import UpdateOne
    
    # Walk every subdirectory of data/ — each is a channel folder
    for channel_dir in data_dir.iterdir():
        if not channel_dir.is_dir() or channel_dir.name in ["media", "reports"]:
            continue
        chats_dir = channel_dir / "chats"
        if not chats_dir.exists():
            continue

        ch_id_on_disk = channel_dir.name
        # Try to find a matching channel in store by id or safe title
        matched_channel_id = None
        channel_title = ch_id_on_disk
        for ch_id, ch in store.channels.items():
            if ch_id == ch_id_on_disk:
                matched_channel_id = ch_id
                channel_title = ch.get("title", ch_id)
                break
            safe_title = re.sub(r"\W+", "_", (ch.get("title") or "").strip()).strip("_")[:80]
            if safe_title == ch_id_on_disk:
                matched_channel_id = ch_id
                channel_title = ch.get("title", ch_id)
                break

        real_channel_id = matched_channel_id or ch_id_on_disk

        # Load every date-wise CSV for this channel
        operations = []
        for csv_path in sorted(chats_dir.glob("messages_*.csv")):
            try:
                with open(csv_path, "r", encoding="utf-8") as f:
                    reader = csv.reader(f)
                    rows = list(reader)
                if len(rows) <= 1:
                    continue
                for r in rows[1:]:
                    if len(r) >= 6:
                        msg_id = r[0]
                        doc = {
                            "id": msg_id,
                            "channel_id": real_channel_id,
                            "channel_username": channel_title,
                            "sender": r[2],
                            "text": r[3],
                            "date": r[1],
                            "views": int(r[4]) if r[4].isdigit() else 10,
                            "media_url": None,
                            "threat_level": r[5] if r[5] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"] else "LOW",
                            "analyzed": True
                        }
                        # If mongo is active, add to bulk upsert operations
                        if mongo_available and db is not None:
                            operations.append(UpdateOne({"id": msg_id}, {"$set": doc}, upsert=True))
                        else:
                            # Fallback to memory
                            if msg_id not in store.messages:
                                store.messages[msg_id] = doc
                                loaded += 1
            except Exception as e:
                logger.warning(f"CSV restore failed for {csv_path}: {e}")
                
        if operations and mongo_available and db is not None:
            try:
                # Flush bulk write per channel
                res = await db.messages.bulk_write(operations, ordered=False)
                migrated_to_db += res.upserted_count
            except Exception as e:
                logger.error(f"Failed to migrate channel {channel_title} to MongoDB: {e}")

    if migrated_to_db > 0:
        logger.info(f"✓ Migrated {migrated_to_db} messages from CSV into MongoDB.")
    elif loaded > 0:
        logger.info(f"✓ Restored {loaded} messages from local CSV files into memory store.")


def _migrate_session_file():
    """Migrate the old darknet_session files from BASE_DIR to DATA_DIR for clean persistence."""
    old_base = settings.BASE_DIR / "darknet_session"
    new_base = settings.DATA_DIR / "darknet_session"

    # Check for all sqlite database files created by Telethon (.session and .session-journal)
    for ext in [".session", ".session-journal"]:
        old_file = old_base.with_name(old_base.name + ext)
        new_file = new_base.with_name(new_base.name + ext)
        if old_file.exists() and not new_file.exists():
            try:
                settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
                import shutil
                shutil.copy2(old_file, new_file)
                logger.info(f"🔑 Moved Telethon session file to secure persistent storage: {old_file.name}")
            except Exception as e:
                logger.warning(f"Could not migrate session file {old_file.name}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """On startup: connect to MongoDB, restore CSV data, then auto-sync Telegram if session exists."""
    logger.info(f"═══════════════════════════════════════════════")
    logger.info(f"  {settings.PROJECT_NAME} v{settings.VERSION} — Starting Up")
    logger.info(f"═══════════════════════════════════════════════")
    logger.info(f"TELEGRAM_API_ID = {settings.TELEGRAM_API_ID}")
    logger.info(f"TELEGRAM_API_HASH = {'*' * 6 + settings.TELEGRAM_API_HASH[-4:] if settings.TELEGRAM_API_HASH else 'NOT SET'}")

    # 1. Test MongoDB connection and log the result
    await connect_to_mongo()

    # 2. Migrate session files to persistent data path
    _migrate_session_file()

    # 3. Restore any already migrated title-based or existing ID folders
    await _migrate_csv_messages_to_db()

    # Auto-sync channels if user session is already saved
    try:
        auth_status = await telegram_scraper.check_auth_status()
        if auth_status.get("is_authorized"):
            user = auth_status.get("user", {})
            username = user.get("username") or user.get("first_name") or "User"
            logger.info(f"✓ Telegram session active — logged in as @{username}. Auto-syncing channels...")
            channels = await telegram_scraper.sync_user_dialogs()
            logger.info(f"✓ Auto-imported {len(channels)} real channels/groups from Telegram account.")
            # Run migration of folders and reload to map them correctly
            _migrate_numeric_folders_to_titles()
            await _migrate_csv_messages_to_db()
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
