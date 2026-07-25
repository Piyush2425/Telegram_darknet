import os
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
from ..config import settings

logger = logging.getLogger("darknet_monitor.scraper")

# Try Telethon import
telethon_available = False
try:
    from telethon import TelegramClient
    from telethon.errors import RPCError
    telethon_available = True
except ImportError:
    telethon_available = False

MOCK_MESSAGES_POOL = [
    {
        "text": "EXCLUSIVITY LEAK: Fresh database dump from major regional logistics provider. 450,000 user records, hashed passwords, SSNs and full address logs. Download link: http://breachlogs.onion/download?id=84920. BTC wallet for VIP access: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa. Contact @admin_darknet for pricing.",
        "threat_level": "CRITICAL",
        "views": 1420
    },
    {
        "text": "CRITICAL ZERO-DAY DISCLOSURE: CVE-2026-11849 affecting Linux kernel eBPF subsystem allowing unprivileged local privilege escalation (LPE) to root. Exploit script POC available on git. IOC hashes: sha256 5f4dcc3b5aa765d61d8327deb882cf992b95990a1ce22255470d061718040a1b.",
        "threat_level": "HIGH",
        "views": 3290
    },
    {
        "text": "Lumma Stealer v4.2 updated with bypass for Chrome 127 Application-Bound Encryption. Features cookie stealing, Telegram session hijacker, and MetaMask wallet grabber. C2 server: 194.165.16.82:8080. Contact LummaDev on Tox.",
        "threat_level": "CRITICAL",
        "views": 5120
    }
]

class TelegramScraper:
    """Telegram Scraper supporting live Telethon client and demo telemetry fallback."""

    def __init__(self):
        self.is_scraping = False
        self.progress = 0
        self.current_channel = ""
        self.logs: List[str] = []
        self.client = None

    def log(self, message: str):
        timestamp = datetime.utcnow().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self.logs.append(log_entry)
        if len(self.logs) > 100:
            self.logs.pop(0)
        logger.info(log_entry)

    async def get_telethon_client(self):
        """Initialize Telethon Client if API ID & Hash are provided."""
        api_id = settings.TELEGRAM_API_ID
        api_hash = settings.TELEGRAM_API_HASH
        bot_token = settings.TELEGRAM_BOT_TOKEN

        if not telethon_available:
            self.log("Telethon library not installed. Running in simulation mode.")
            return None

        if api_id > 0 and api_hash:
            try:
                session_path = str(settings.BASE_DIR / "darknet_session")
                client = TelegramClient(session_path, api_id, api_hash)
                if bot_token:
                    await client.start(bot_token=bot_token)
                else:
                    await client.connect()
                return client
            except Exception as e:
                self.log(f"Telethon connection warning: {e}. Falling back to demo telemetry.")
                return None
        else:
            self.log("Telegram API ID / API Hash not configured in .env or Settings. Running in demo mode.")
            return None

    async def scrape_channels(self, channels: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fetch real Telegram messages via Telethon or fallback to demo telemetry."""
        self.is_scraping = True
        self.progress = 0
        self.logs.clear()
        self.log(f"Initiating Telegram data collection across {len(channels)} channels...")

        client = await self.get_telethon_client()
        all_scraped_messages = []
        total_channels = len(channels)

        for idx, channel in enumerate(channels):
            username = channel.get("username", "").replace("@", "").strip()
            self.current_channel = username
            self.log(f"Connecting to Telegram API... Fetching live posts from @{username}")

            scraped_from_channel = []

            if client and await client.is_user_authorized():
                try:
                    # Fetch REAL live messages using Telethon
                    entity = await client.get_entity(username)
                    async for message in client.iter_messages(entity, limit=30):
                        if not message.text:
                            continue
                        
                        msg_date = message.date if message.date else datetime.utcnow()
                        msg_data = {
                            "id": f"msg_{channel['id']}_{message.id}",
                            "channel_id": channel["id"],
                            "channel_username": username,
                            "sender": message.sender_id or f"User_{username}",
                            "text": message.text,
                            "date": msg_date.isoformat(),
                            "views": getattr(message, "views", 100) or 100,
                            "media_url": None,
                            "threat_level": "LOW",  # Will be assessed by LLM Threat Analyzer
                            "analyzed": False
                        }
                        scraped_from_channel.append(msg_data)

                    self.log(f"✓ REAL Telegram API: Scraped {len(scraped_from_channel)} live posts from @{username}")
                except Exception as e:
                    self.log(f"Real Telethon fetch for @{username} encountered error: {e}. Generating demo telemetry.")
                    scraped_from_channel = self._generate_mock_messages(channel)
            else:
                # Demo telemetry fallback
                await asyncio.sleep(0.8)
                scraped_from_channel = self._generate_mock_messages(channel)
                self.log(f"Demo Mode: Generated {len(scraped_from_channel)} telemetry posts for @{username}")

            all_scraped_messages.extend(scraped_from_channel)
            self.progress = int(((idx + 1) / total_channels) * 100)

        if client:
            try:
                await client.disconnect()
            except Exception:
                pass

        self.log(f"Scraping completed! Total {len(all_scraped_messages)} messages collected.")
        self.is_scraping = False
        return all_scraped_messages

    def _generate_mock_messages(self, channel: Dict[str, Any]) -> List[Dict[str, Any]]:
        import random
        num_messages = random.randint(3, 5)
        msgs = []
        for m_idx in range(num_messages):
            sample = random.choice(MOCK_MESSAGES_POOL)
            msg_time = datetime.utcnow() - timedelta(minutes=random.randint(5, 120))
            msgs.append({
                "id": f"msg_{channel['id']}_{m_idx}_{int(msg_time.timestamp())}",
                "channel_id": channel["id"],
                "channel_username": channel.get("username", "Unknown"),
                "sender": f"User_{random.randint(1000, 9999)}",
                "text": sample["text"],
                "date": msg_time.isoformat(),
                "views": sample["views"] + random.randint(10, 500),
                "media_url": None,
                "threat_level": sample["threat_level"],
                "analyzed": False
            })
        return msgs

telegram_scraper = TelegramScraper()
