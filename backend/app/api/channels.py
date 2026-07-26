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

IST = timezone(timedelta(hours=5, minutes=30))
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
        "next_scrape_at": None,
        "is_auto_ai": False,
        "ai_interval_value": 60,
        "ai_interval_unit": "minutes",
        "next_ai_at": None,
        "is_auto_report": False,
        "report_interval_value": 24,
        "report_interval_unit": "hours",
        "next_report_at": None
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

class ScheduleChannelRequest(BaseModel):
    is_auto_monitoring: bool
    interval_value: int
    interval_unit: str  # "minutes" or "hours"
    is_auto_ai: Optional[bool] = False
    ai_interval_value: Optional[int] = 60
    ai_interval_unit: Optional[str] = "minutes"  # "minutes", "hours", or "days"
    is_auto_report: Optional[bool] = False
    report_interval_value: Optional[int] = 24
    report_interval_unit: Optional[str] = "hours"  # "minutes", "hours", or "days"

@router.post("/{channel_id}/schedule")
async def schedule_channel_scrape(channel_id: str, req: ScheduleChannelRequest):
    """Enable, disable, or configure the auto-scraping, auto-AI, and auto-Report scheduler for a specific channel."""
    if channel_id not in store.channels:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    ch = store.channels[channel_id]
    ch["is_auto_monitoring"] = req.is_auto_monitoring
    ch["monitoring_interval_value"] = req.interval_value
    ch["monitoring_interval_unit"] = req.interval_unit
    
    if req.is_auto_monitoring:
        now = datetime.now(IST)
        if req.interval_unit == "hours":
            delta = timedelta(hours=req.interval_value)
        else:
            delta = timedelta(minutes=req.interval_value)
        ch["next_scrape_at"] = now + delta
    else:
        ch["next_scrape_at"] = None

    # Save AI schedule parameters
    ch["is_auto_ai"] = req.is_auto_ai
    ch["ai_interval_value"] = req.ai_interval_value or 60
    ch["ai_interval_unit"] = req.ai_interval_unit or "minutes"
    
    if req.is_auto_ai:
        now = datetime.now(IST)
        ai_val = req.ai_interval_value or 60
        ai_unit = req.ai_interval_unit or "minutes"
        
        if ai_unit == "days":
            delta = timedelta(days=ai_val)
        elif ai_unit == "hours":
            delta = timedelta(hours=ai_val)
        else:
            delta = timedelta(minutes=ai_val)
            
        ch["next_ai_at"] = now + delta
    else:
        ch["next_ai_at"] = None

    # Save Report schedule parameters
    ch["is_auto_report"] = req.is_auto_report
    ch["report_interval_value"] = req.report_interval_value or 24
    ch["report_interval_unit"] = req.report_interval_unit or "hours"
    
    if req.is_auto_report:
        now = datetime.now(IST)
        rep_val = req.report_interval_value or 24
        rep_unit = req.report_interval_unit or "hours"
        
        if rep_unit == "days":
            delta = timedelta(days=rep_val)
        elif rep_unit == "hours":
            delta = timedelta(hours=rep_val)
        else:
            delta = timedelta(minutes=rep_val)
            
        ch["next_report_at"] = now + delta
    else:
        ch["next_report_at"] = None
        
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

class AIReportRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None

@router.post("/{channel_id}/ai-report")
async def generate_channel_ai_report(channel_id: str, req: AIReportRequest):
    """Compile an AI Threat Intelligence Report for a specific channel within a date range."""
    if channel_id not in store.channels:
        raise HTTPException(status_code=404, detail="Channel not found")
        
    ch = store.channels[channel_id]
    
    # 1. Fetch channel messages from CSV or memory fallback
    from .messages import _load_messages_from_csv
    msgs = list(store.messages.values())
    channel_msgs = [m for m in msgs if m["channel_id"] == channel_id]
    
    if not channel_msgs:
        channel_msgs = _load_messages_from_csv(channel_id, ch["title"])
        for m in channel_msgs:
            store.messages[m["id"]] = m
            
    # 2. Filter messages matching date range
    filtered = []
    for msg in channel_msgs:
        msg_date_str = msg.get("date", "")
        try:
            # ISO timestamp e.g. "2026-07-25T09:34:49+00:00" -> compare dates
            msg_dt = datetime.fromisoformat(msg_date_str.replace("Z", "+00:00"))
            
            if req.start_date:
                start_dt = datetime.fromisoformat(f"{req.start_date}T00:00:00+00:00")
                if msg_dt < start_dt:
                    continue
            if req.end_date:
                end_dt = datetime.fromisoformat(f"{req.end_date}T23:59:59+00:00")
                if msg_dt > end_dt:
                    continue
            filtered.append(msg)
        except Exception:
            filtered.append(msg)
            
    if not filtered:
        raise HTTPException(
            status_code=400, 
            detail=f"No scraped messages found for '{ch['title']}' within the selected date range ({req.start_date} to {req.end_date})."
        )
        
    # 3. Generate report using threat analyzer
    # Run in a threadpool so it doesn't block the main event loop
    report_md = await asyncio.to_thread(
        analyzer.generate_ai_threat_report, 
        filtered, 
        req.start_date or "earliest", 
        req.end_date or "latest", 
        ch["title"]
    )
    
    # 4. Generate PDF format report (detailed report containing all discussions & parameters)
    from ..reports.pdf_generator import create_detailed_pdf_report
    
    timestamp_str = datetime.now(IST).strftime("%Y-%m-%d_%H%M%S")
    report_id = f"rep_ai_{timestamp_str}"
    
    # Define file paths
    channel_reports_dir = settings.DATA_DIR / channel_id / "reports"
    channel_reports_dir.mkdir(parents=True, exist_ok=True)
    
    pdf_path = channel_reports_dir / f"AI_Report_{channel_id}_{timestamp_str}.pdf"
    md_path = channel_reports_dir / f"AI_Report_{channel_id}_{timestamp_str}.md"
    
    # Save files
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(report_md)
        
    await asyncio.to_thread(
        create_detailed_pdf_report,
        ch["title"],
        req.start_date or "earliest",
        req.end_date or "latest",
        filtered,
        report_md,
        pdf_path
    )
    
    # Register report metadata in global store
    store.reports[report_id] = {
        "id": report_id,
        "title": f"AI CTI Analysis Report - {ch['title']}",
        "created_at": datetime.now(IST).isoformat(),
        "period": "custom",
        "channels_analyzed": [ch["title"]],
        "total_messages": len(filtered),
        "total_threats": 1,
        "markdown_path": str(md_path.relative_to(settings.BASE_DIR)),
        "pdf_path": str(pdf_path.relative_to(settings.BASE_DIR)),
        "summary": f"AI-compiled Cyber Threat Intelligence report for '{ch['title']}' containing detailed usernames, telemetry, and shared URLs."
    }
    
    return {
        "report": report_md, 
        "channel_title": ch["title"], 
        "count": len(filtered),
        "report_id": report_id
    }

@router.get("/{channel_id}/live-report")
async def get_live_channel_report(channel_id: str, date: Optional[str] = None):
    """Retrieve the raw daily markdown log (and its AI summary) for a channel from structured storage."""
    if channel_id not in store.channels:
        raise HTTPException(status_code=404, detail="Channel not found")
        
    ch = store.channels[channel_id]
    
    # Defaults to today in India Standard Time (IST)
    date_str = date or datetime.now(IST).strftime("%Y-%m-%d")
    
    channel_reports_dir = settings.DATA_DIR / channel_id / "reports"
    log_path = channel_reports_dir / f"ChatLog_{channel_id}_{date_str}.md"
    
    if not log_path.exists():
        fallback_md = f"""# 📝 Live Chat Logs Directory: {ch['title']}
**Date:** {date_str}
**Channel Username/ID:** {channel_id}

_No chat transcripts or AI intelligence reports have been compiled for this channel today yet._
"""
        return {"report": fallback_md, "channel_title": ch["title"], "date": date_str}
        
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"report": content, "channel_title": ch["title"], "date": date_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read report from disk: {e}")

@router.get("/{channel_id}/live-report/download-pdf")
async def download_live_report_pdf(channel_id: str, date: Optional[str] = None):
    """Generate and download the PDF report instantly for the selected date on-the-fly."""
    if channel_id not in store.channels:
        raise HTTPException(status_code=404, detail="Channel not found")
        
    ch = store.channels[channel_id]
    date_str = date or datetime.now(IST).strftime("%Y-%m-%d")
    
    channel_reports_dir = settings.DATA_DIR / channel_id / "reports"
    log_path = channel_reports_dir / f"ChatLog_{channel_id}_{date_str}.md"
    
    if not log_path.exists():
        raise HTTPException(status_code=404, detail="Daily intelligence log not found for today. Run a scrape and analysis cycle first.")
        
    # Read md report content
    with open(log_path, "r", encoding="utf-8") as f:
        report_md = f.read()
        
    # Fetch today's messages
    msgs = [m for m in store.messages.values() if m.get("channel_id") == channel_id]
    today_msgs = []
    for m in msgs:
        msg_date = m.get("date", "")
        try:
            msg_utc = datetime.fromisoformat(msg_date.replace("Z", "+00:00"))
            msg_ist = msg_utc.astimezone(IST)
            if msg_ist.strftime("%Y-%m-%d") == date_str:
                today_msgs.append(m)
        except Exception:
            if msg_date.startswith(date_str):
                today_msgs.append(m)
                
    # Create the PDF report instantly using ReportLab
    temp_pdf_path = channel_reports_dir / f"Temp_AI_Report_{channel_id}_{date_str}.pdf"
    
    from ..reports.pdf_generator import create_detailed_pdf_report
    from fastapi.responses import FileResponse
    
    await asyncio.to_thread(
        create_detailed_pdf_report,
        ch["title"],
        date_str,
        date_str,
        today_msgs,
        report_md,
        temp_pdf_path
    )
    
    return FileResponse(
        path=temp_pdf_path,
        media_type="application/pdf",
        filename=f"CTI_Intelligence_Report_{ch['title']}_{date_str}.pdf"
    )



