import asyncio
import logging
from datetime import datetime

logger = logging.getLogger("darknet_monitor.scheduler")

class BackgroundScheduler:
    """Simple async background task runner for periodic channel scraping."""
    
    def __init__(self):
        self.is_running = False
        self.interval_minutes = 60
        self.last_run: datetime = None
        self._task = None

    def start(self, interval_minutes: int = 60):
        self.interval_minutes = interval_minutes
        self.is_running = True
        logger.info(f"Background scraper scheduler started with {interval_minutes}m interval.")

    def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
        logger.info("Background scraper scheduler stopped.")

scheduler = BackgroundScheduler()
