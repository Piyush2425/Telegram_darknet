from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class Channel(BaseModel):
    id: str
    username: str
    title: str
    description: Optional[str] = ""
    member_count: int = 0
    is_monitored: bool = False
    last_scraped_at: Optional[datetime] = None
    category: str = "General Threat"

class Message(BaseModel):
    id: str
    channel_id: str
    channel_username: str
    sender: str
    text: str
    date: datetime
    views: int = 0
    media_url: Optional[str] = None
    threat_level: str = "LOW"  # LOW, MEDIUM, HIGH, CRITICAL
    analyzed: bool = False

class ThreatIntelligence(BaseModel):
    id: str
    message_id: str
    channel_username: str
    timestamp: datetime
    urls: List[str] = []
    suspicious_activities: List[str] = []
    threat_actors: List[str] = []
    malware_references: List[str] = []
    cves: List[str] = []
    iocs: List[str] = []  # Hashes (MD5/SHA256)
    crypto_wallets: List[str] = []
    emails: List[str] = []
    domains_ips: List[str] = []
    leaked_credentials: List[str] = []
    summary: str = ""
    risk_score: int = 0

class Report(BaseModel):
    id: str
    title: str
    created_at: datetime
    period: str  # daily, hourly, combined
    channels_analyzed: List[str]
    total_messages: int
    total_threats: int
    markdown_path: str
    pdf_path: Optional[str] = None
    summary: str
