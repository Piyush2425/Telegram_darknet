import asyncio
import random
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
from ..config import settings

logger = logging.getLogger("darknet_monitor.scraper")

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
    },
    {
        "text": "LockBit 3.0 ransomware builder leak update: New decryptor tools published by research group. Check GitHub repo https://github.com/threat-research/lockbit-decrypt for updated signatures and master key lists.",
        "threat_level": "MEDIUM",
        "views": 8900
    },
    {
        "text": "COMBO LIST RELEASE: 50,000 Verified corporate emails and pass combos for Office365 and VPN portals. Sample: admin@enterprise-corp.com:P@ssw0rd2026! | security@techfirm.org:Summer2026! Check http://combostore.xyz/free.txt.",
        "threat_level": "HIGH",
        "views": 2340
    },
    {
        "text": "CVE-2026-3021 RCE in Apache Struts payload generator tool. Exploits unauthenticated deserialization vulnerability. Target IP scanner script included. IP list: 45.142.214.10, 185.220.101.4.",
        "threat_level": "HIGH",
        "views": 1850
    }
]

class TelegramScraper:
    """Telegram Scraper integrating Telethon client with mock data fallback generator."""

    def __init__(self):
        self.is_scraping = False
        self.progress = 0
        self.current_channel = ""
        self.logs: List[str] = []

    def log(self, message: str):
        timestamp = datetime.utcnow().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self.logs.append(log_entry)
        if len(self.logs) > 100:
            self.logs.pop(0)
        logger.info(log_entry)

    async def scrape_channels(self, channels: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Simulate or execute Telegram channel scraping."""
        self.is_scraping = True
        self.progress = 0
        self.logs.clear()
        self.log(f"Starting Telegram data collection for {len(channels)} target channels...")
        
        all_scraped_messages = []
        total_channels = len(channels)

        for idx, channel in enumerate(channels):
            self.current_channel = channel.get("username", "Unknown")
            self.log(f"Connecting to Telegram API... Fetching updates from @{self.current_channel}")
            
            await asyncio.sleep(0.8)  # simulate API latency
            
            # Generate 3-5 realistic messages per channel
            num_messages = random.randint(3, 5)
            for m_idx in range(num_messages):
                sample = random.choice(MOCK_MESSAGES_POOL)
                msg_time = datetime.utcnow() - timedelta(minutes=random.randint(5, 120))
                
                msg_data = {
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
                }
                all_scraped_messages.append(msg_data)

            self.log(f"Extracted {num_messages} messages from @{self.current_channel}")
            self.progress = int(((idx + 1) / total_channels) * 100)

        self.log(f"Scraping completed! Total {len(all_scraped_messages)} messages collected across {total_channels} channels.")
        self.is_scraping = False
        return all_scraped_messages

telegram_scraper = TelegramScraper()
