import asyncio
from fastapi import APIRouter, BackgroundTasks
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

    # Trigger incremental analysis cycle and URL ledger compilation for each monitored channel!
    from ..scrapers.scheduler import run_mini_ai_analysis_cycle
    for ch in monitored:
        try:
            await run_mini_ai_analysis_cycle(ch["id"])
        except Exception as e:
            import logging
            logging.getLogger("darknet_monitor.scraper").error(f"Error executing manual scraper CTI cycle: {e}")

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
        "progress": telegram_scraper.progress,
        "current_channel": telegram_scraper.current_channel,
        "logs": telegram_scraper.logs
    }
