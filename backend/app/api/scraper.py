import asyncio
import json
from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import StreamingResponse
from ..db.mongodb import store
from ..scrapers.telegram_scraper import telegram_scraper
from ..llm.threat_analyzer import analyzer
from ..reports.report_generator import report_generator

router = APIRouter(prefix="/scraper", tags=["Scraper"])

async def run_scraping_job():
    monitored = [c for c in store.channels.values() if c["is_monitored"]]
    if not monitored:
        telegram_scraper.log("No channels selected for monitoring. Please enable monitoring on channels.")
        return

    messages = await telegram_scraper.scrape_channels(monitored)
    
    # Store messages & analyze with LLM Threat Analyzer in a thread pool
    threat_intels = []
    for msg in messages:
        store.messages[msg["id"]] = msg
        intel = await asyncio.to_thread(analyzer.analyze_message, msg)
        store.threat_intel[intel["id"]] = intel
        threat_intels.append(intel)

    # Generate Report
    channel_names = [c["username"] for c in monitored]
    rep_meta = report_generator.generate_report(messages, threat_intels, channel_names)
    store.reports[rep_meta["id"]] = rep_meta
    telegram_scraper.log(f"Generated new intelligence report: {rep_meta['title']}")

@router.post("/start")
async def start_scraping(background_tasks: BackgroundTasks):
    """Trigger manual Telegram scraping and LLM threat extraction."""
    if telegram_scraper.is_scraping:
        return {"status": "Scraping already in progress"}
    
    background_tasks.add_task(run_scraping_job)
    return {"status": "Scraping initiated in background"}

@router.get("/status")
async def get_scraping_status():
    """Get real-time scraping progress and logs."""
    return {
        "is_scraping": telegram_scraper.is_scraping,
        "stop_requested": telegram_scraper._stop_requested,
        "progress": telegram_scraper.progress,
        "current_channel": telegram_scraper.current_channel,
        "logs": telegram_scraper.logs,
        "scrape_queue": telegram_scraper.scrape_queue,
        "completed_channels": telegram_scraper.completed_channels,
        "total_channels_count": telegram_scraper.total_channels_count,
    }

@router.get("/stream")
async def stream_scraper_status():
    """Stream real-time scraper progress and logs using Server-Sent Events (SSE)."""
    async def event_generator():
        last_status = None
        while True:
            # Capture snapshot of state
            current_status = {
                "is_scraping": telegram_scraper.is_scraping,
                "progress": telegram_scraper.progress,
                "current_channel": telegram_scraper.current_channel,
                "logs": list(telegram_scraper.logs),
                "scrape_queue": list(telegram_scraper.scrape_queue),
                "completed_channels": list(telegram_scraper.completed_channels),
                "total_channels_count": telegram_scraper.total_channels_count,
            }
            if current_status != last_status:
                last_status = current_status
                yield f"data: {json.dumps(current_status)}\n\n"
            await asyncio.sleep(0.8)
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/stop")
async def stop_scraping():
    """Gracefully stop any running scraping job."""
    if not telegram_scraper.is_scraping:
        return {"status": "No scraping job is currently running"}
    telegram_scraper.stop()
    return {"status": "Stop signal sent. Scraping will halt after the current channel completes."}
