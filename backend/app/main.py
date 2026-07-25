import asyncio
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
from .db.mongodb import get_db_status
from .scrapers.telegram_scraper import telegram_scraper
from .scrapers.scheduler import run_scheduler, stop_scheduler

logger = logging.getLogger("darknet_monitor")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """On startup: if Telegram session exists and user is authorized, auto-sync all channels."""
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"TELEGRAM_API_ID = {settings.TELEGRAM_API_ID}")
    logger.info(f"TELEGRAM_API_HASH = {'*' * 6 + settings.TELEGRAM_API_HASH[-4:] if settings.TELEGRAM_API_HASH else 'NOT SET'}")
    
    # Auto-sync channels if user session is already saved
    try:
        auth_status = await telegram_scraper.check_auth_status()
        if auth_status.get("is_authorized"):
            user = auth_status.get("user", {})
            username = user.get("username") or user.get("first_name") or "User"
            logger.info(f"✓ Telegram session active — logged in as @{username}. Auto-syncing channels...")
            channels = await telegram_scraper.sync_user_dialogs()
            logger.info(f"✓ Auto-imported {len(channels)} real channels/groups from Telegram account.")
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

@app.get("/api/health")
async def health_check():
    db_status = await get_db_status()
    return {
        "status": "online",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": db_status
    }
