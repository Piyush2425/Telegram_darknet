import asyncio
import logging
from datetime import datetime, timedelta, timezone
from ..db.mongodb import store
from ..scrapers.telegram_scraper import telegram_scraper
from ..llm.threat_analyzer import analyzer
from ..reports.report_generator import report_generator

logger = logging.getLogger("darknet_monitor.scheduler")

scheduler_active = True

async def scrape_channel_silent(channel_id: str):
    """Scrapes a channel silently without blocking progress feedback."""
    ch = store.channels.get(channel_id)
    if not ch:
        return
    
    logger.info(f"[Scheduler] Auto-scraping channel '{ch['title']}'...")
    telegram_scraper.log(f"⏰ Auto-scrape triggered for channel '{ch['title']}'")
    
    try:
        messages = await telegram_scraper.scrape_channels([ch])
        threat_intels = []
        
        for msg in messages:
            store.messages[msg["id"]] = msg
            intel = await asyncio.to_thread(analyzer.analyze_message, msg)
            store.threat_intel[intel["id"]] = intel
            threat_intels.append(intel)

        if messages:
            rep_meta = report_generator.generate_report(messages, threat_intels, [ch.get("username", ch.get("title"))])
            store.reports[rep_meta["id"]] = rep_meta
            telegram_scraper.log(f"✓ Auto-scrape finished for '{ch['title']}'. Collected {len(messages)} messages.")
    except Exception as e:
        logger.error(f"Error during auto-scrape task for {channel_id}: {e}")

async def run_scheduler():
    """Persistent background task to scan and run auto-scrapes."""
    global scheduler_active
    logger.info("Initializing automated target channel monitoring scheduler...")
    
    while scheduler_active:
        try:
            now = datetime.now(timezone.utc)
            for ch_id, ch in list(store.channels.items()):
                if ch.get("is_auto_monitoring"):
                    next_scrape = ch.get("next_scrape_at")
                    
                    # Convert string timezone dates back to datetime object if loaded from MongoDB/Json
                    if isinstance(next_scrape, str):
                        try:
                            # Strip UTC suffix if any
                            clean_dt = next_scrape.replace("Z", "+00:00")
                            next_scrape = datetime.fromisoformat(clean_dt)
                        except Exception:
                            next_scrape = None

                    if not next_scrape or now >= next_scrape:
                        # Calculate next run timestamp
                        val = ch.get("monitoring_interval_value", 60)
                        unit = ch.get("monitoring_interval_unit", "minutes")
                        
                        if unit == "hours":
                            delta = timedelta(hours=val)
                        else:
                            delta = timedelta(minutes=val)
                            
                        ch["next_scrape_at"] = now + delta
                        
                        # Trigger scraping in the background
                        asyncio.create_task(scrape_channel_silent(ch_id))
        except Exception as e:
            logger.error(f"Scheduler loop error: {e}")
            
        await asyncio.sleep(15)  # Scan every 15 seconds

def stop_scheduler():
    global scheduler_active
    scheduler_active = False
    logger.info("Scheduler loop stopped.")
