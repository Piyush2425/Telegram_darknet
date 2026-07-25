import csv
import re
from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from pathlib import Path
from ..db.mongodb import store
from ..db.models import Message
from ..config import settings

router = APIRouter(prefix="/messages", tags=["Messages"])

def _safe_name(s: str) -> str:
    s = re.sub(r"\W+", "_", (s or "").strip())
    s = s.strip("_")
    return s[:80] if s else "target"

def _load_messages_from_csv(channel_id: str, channel_title: str) -> List[dict]:
    """Load and parse messages from CSV file for the channel."""
    messages = []
    try:
        safe_name = _safe_name(channel_title)
        csv_path = settings.BASE_DIR / "data" / "chats" / f"messages_{safe_name}.csv"
        if csv_path.exists():
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                rows = list(reader)
                if len(rows) > 1:
                    # Skip header row
                    for r in rows[1:]:
                        if len(r) >= 6:
                            messages.append({
                                "id": r[0],
                                "channel_id": channel_id,
                                "channel_username": channel_title,
                                "sender": r[2],
                                "text": r[3],
                                "date": r[1],
                                "views": int(r[4]) if r[4].isdigit() else 10,
                                "media_url": None,
                                "threat_level": r[5] if r[5] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"] else "LOW",
                                "analyzed": True
                            })
    except Exception as e:
        pass
    return messages

@router.get("", response_model=List[Message])
async def get_messages(
    channel_id: Optional[str] = None,
    threat_level: Optional[str] = None,
    search: Optional[str] = None
):
    """Retrieve collected messages with filtering, searching, and CSV fallback loading."""
    msgs = list(store.messages.values())

    # Check if we have messages in memory *for this specific channel*
    channel_msgs_in_memory = [m for m in msgs if m["channel_id"] == channel_id] if channel_id else msgs

    # Fallback to load from CSV if memory does not contain messages for this channel
    if channel_id and not channel_msgs_in_memory and channel_id in store.channels:
        ch = store.channels[channel_id]
        csv_msgs = _load_messages_from_csv(channel_id, ch["title"])
        # Cache them in memory store so subsequent UI polls are instant
        for m in csv_msgs:
            store.messages[m["id"]] = m
        # Refresh global msgs array
        msgs = list(store.messages.values())

    # Apply filters
    if channel_id:
        msgs = [m for m in msgs if m["channel_id"] == channel_id]
    if threat_level:
        msgs = [m for m in msgs if m["threat_level"].upper() == threat_level.upper()]
    if search:
        s_lower = search.lower()
        msgs = [m for m in msgs if s_lower in m["text"].lower()]

    # Sort newest first
    msgs.sort(key=lambda x: x["date"], reverse=True)
    return msgs
