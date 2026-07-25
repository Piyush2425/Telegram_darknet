from fastapi import APIRouter, Query
from typing import List, Optional
from ..db.mongodb import store
from ..db.models import Message

router = APIRouter(prefix="/messages", tags=["Messages"])

@router.get("", response_model=List[Message])
async def get_messages(
    channel_id: Optional[str] = None,
    threat_level: Optional[str] = None,
    search: Optional[str] = None
):
    """Retrieve collected messages with filtering and search capabilities."""
    msgs = list(store.messages.values())

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
