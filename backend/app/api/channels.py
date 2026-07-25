import os
import csv
import re
import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pathlib import Path
from ..db.mongodb import store
from ..db.models import Channel
from ..scrapers.telegram_scraper import telegram_scraper
from ..llm.threat_analyzer import analyzer
from ..reports.report_generator import report_generator
from ..config import settings

router = APIRouter(prefix="/channels", tags=["Channels"])

class AddChannelRequest(BaseModel):
    username: str
    title: Optional[str] = None
    category: Optional[str] = "Custom Monitored"

class ScheduleChannelRequest(BaseModel):
    is_auto_monitoring: bool
    interval_value: int
    interval_unit: str  # "minutes" or "hours"

def _safe_name(s: str) -> str:
    s = re.sub(r"\W+", "_", (s or "").strip())
    s = s.strip("_")
    return s[:80] if s else "target"

def _get_csv_message_count(channel_title: str) -> int:
    """Read the channel's CSV file and return the count of messages."""
    try:
        safe_name = _safe_name(channel_title)
        csv_path = settings.BASE_DIR / "data" / "chats" / f"messages_{safe_name}.csv"
        if csv_path.exists():
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                rows = list(reader)
                if len(rows) > 0:
                    return len(rows) - 1 # Subtract header row
        return 0
    except Exception:
        return 0

@router.get("", response_model=List[Channel])
async def list_channels():
    """List all available Telegram channels & groups with persisted message counts from CSV."""
    channels = list(store.channels.values())
    for ch in channels:
        ch["message_count"] = _get_csv_message_count(ch["title"])
    return channels

@router.post("/sync-telegram")
async def sync_user_telegram_channels():
    """Import all real channels and groups from the authenticated Telegram account."""
    channels = await telegram_scraper.sync_user_dialogs()
    return {
        "status": "synced",
        "imported_count": len(channels),
        "channels": list(store.channels.values())
    }

@router.post("/add", response_model=Channel)
async def add_custom_channel(req: AddChannelRequest):
    """Add a new custom Telegram channel/group by username."""
    raw_username = req.username.replace("@", "").strip()
    if not raw_username:
        raise HTTPException(status_code=400, detail="Invalid channel username")

    for ch in store.channels.values():
        if ch["username"].lower() == f"@{raw_username.lower()}":
            return ch

    new_id = f"c_{len(store.channels) + 1}"
    new_channel = {
        "id": new_id,
        "username": f"@{raw_username}",
        "raw_username": raw_username,
        "title": req.title or f"@{raw_username}",
        "description": f"Custom Telegram channel @{raw_username}",
        "member_count": 5000,
        "is_monitored": True,
        "last_scraped_at": None,
        "category": "Custom Monitored",
        "type": "Channel",
        "message_count": 0,
        "status": "idle",
        "is_auto_monitoring": False,
        "monitoring_interval_value": 60,
        "monitoring_interval_unit": "minutes",
        "next_scrape_at": None
    }

    store.channels[new_id] = new_channel
    return new_channel

@router.post("/{channel_id}/toggle-monitoring")
async def toggle_channel_monitoring(channel_id: str):
    """Toggle monitoring state for a channel."""
    if channel_id not in store.channels:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    current = store.channels[channel_id]["is_monitored"]
    store.channels[channel_id]["is_monitored"] = not current
    return {
        "channel_id": channel_id,
        "is_monitored": store.channels[channel_id]["is_monitored"]
    }

@router.post("/{channel_id}/schedule")
async def schedule_channel_scrape(channel_id: str, req: ScheduleChannelRequest):
    """Enable, disable, or configure the auto-scraping scheduler for a specific channel."""
    if channel_id not in store.channels:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    ch = store.channels[channel_id]
    ch["is_auto_monitoring"] = req.is_auto_monitoring
    ch["monitoring_interval_value"] = req.interval_value
    ch["monitoring_interval_unit"] = req.interval_unit
    
    if req.is_auto_monitoring:
        now = datetime.now(timezone.utc)
        if req.interval_unit == "hours":
            delta = timedelta(hours=req.interval_value)
        else:
            delta = timedelta(minutes=req.interval_value)
        ch["next_scrape_at"] = now + delta
    else:
        ch["next_scrape_at"] = None
        
    return ch

@router.delete("/{channel_id}")
async def delete_channel(channel_id: str):
    """Delete a channel from the monitored list."""
    if channel_id not in store.channels:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    deleted = store.channels.pop(channel_id)
    return {"status": "deleted", "channel_id": channel_id, "title": deleted.get("title")}

async def scrape_single_channel_task(channel_id: str):
    ch = store.channels.get(channel_id)
    if not ch:
        return
    messages = await telegram_scraper.scrape_channels([ch])
    threat_intels = []
    
    # Run threat analysis in a separate thread so it doesn't block the main event loop
    for msg in messages:
        store.messages[msg["id"]] = msg
        intel = await asyncio.to_thread(analyzer.analyze_message, msg)
        store.threat_intel[intel["id"]] = intel
        threat_intels.append(intel)

    if messages:
        rep_meta = report_generator.generate_report(messages, threat_intels, [ch.get("username", ch.get("title"))])
        store.reports[rep_meta["id"]] = rep_meta

@router.post("/{channel_id}/scrape")
async def scrape_single_channel(channel_id: str, background_tasks: BackgroundTasks):
    """Trigger a scrape run for a single channel."""
    if channel_id not in store.channels:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    background_tasks.add_task(scrape_single_channel_task, channel_id)
    return {"status": "scraping_initiated", "channel_id": channel_id}
