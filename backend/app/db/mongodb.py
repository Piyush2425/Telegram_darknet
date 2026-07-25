import logging
from typing import Dict, List, Any, Optional
from ..config import settings

logger = logging.getLogger("darknet_monitor.db")

class InMemoryStore:
    """Fallback in-memory database store if MongoDB connection fails or is absent."""
    def __init__(self):
        self.channels: Dict[str, dict] = {}
        self.messages: Dict[str, dict] = {}
        self.threat_intel: Dict[str, dict] = {}
        self.reports: Dict[str, dict] = {}

    def seed_default_channels(self):
        default_channels = [
            {
                "id": "c1",
                "username": "BreachForums_News",
                "title": "BreachForums Official Leaks",
                "description": "Exclusives, database breaches, stolen credentials and zero-day discussions.",
                "member_count": 84200,
                "is_monitored": True,
                "last_scraped_at": None,
                "category": "Data Leaks"
            },
            {
                "id": "c2",
                "username": "vx_underground_chat",
                "title": "VX-Underground Malware Feed",
                "description": "Malware source code, ransomware samples, and reverse engineering research.",
                "member_count": 115000,
                "is_monitored": True,
                "last_scraped_at": None,
                "category": "Malware & Ransomware"
            },
            {
                "id": "c3",
                "username": "PwnForums_Chat",
                "title": "PwnForums Exploit Marketplace",
                "description": "RCE exploits, vulnerability disclosures, CVE trading, and stealer logs.",
                "member_count": 42100,
                "is_monitored": True,
                "last_scraped_at": None,
                "category": "Exploits & CVEs"
            },
            {
                "id": "c4",
                "username": "Cracked_Status_Intel",
                "title": "Cracked & Carding Logs",
                "description": "COMBO lists, CC logs, bank logs, and stealer payload distributions.",
                "member_count": 36700,
                "is_monitored": False,
                "last_scraped_at": None,
                "category": "Financial Crime"
            },
            {
                "id": "c5",
                "username": "Intelligen_e_Hub",
                "title": "APT Threat Actor Intelligence",
                "description": "Tracking state-sponsored APT groups, operational infrastructure, and phishing kits.",
                "member_count": 29400,
                "is_monitored": False,
                "last_scraped_at": None,
                "category": "APT Intelligence"
            }
        ]
        for c in default_channels:
            self.channels[c["id"]] = c

store = InMemoryStore()
store.seed_default_channels()

# Try initializing Motor MongoDB Client
mongo_available = False
db_client = None

try:
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=2000)
    db = client[settings.DATABASE_NAME]
    mongo_available = True
except Exception as e:
    logger.warning(f"MongoDB not connected: {e}. Using in-memory database store.")
    mongo_available = False

async def get_db_status():
    return {
        "mongo_connected": mongo_available,
        "database_name": settings.DATABASE_NAME,
        "mode": "MongoDB" if mongo_available else "In-Memory Store"
    }
