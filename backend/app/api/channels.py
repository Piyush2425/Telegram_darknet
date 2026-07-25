from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from ..db.mongodb import store
from ..db.models import Channel

router = APIRouter(prefix="/channels", tags=["Channels"])

class AddChannelRequest(BaseModel):
    username: str
    title: Optional[str] = None
    category: Optional[str] = "Custom Monitored"

@router.get("", response_model=List[Channel])
async def list_channels():
    """List all available Telegram channels & groups."""
    return list(store.channels.values())

@router.post("/add", response_model=Channel)
async def add_custom_channel(req: AddChannelRequest):
    """Add a new custom Telegram channel/group by username."""
    raw_username = req.username.replace("@", "").strip()
    if not raw_username:
        raise HTTPException(status_code=400, detail="Invalid channel username")

    # Check if exists
    for ch in store.channels.values():
        if ch["username"].lower() == raw_username.lower():
            return ch

    new_id = f"c_{len(store.channels) + 1}"
    new_channel = {
        "id": new_id,
        "username": raw_username,
        "title": req.title or f"@{raw_username}",
        "description": f"Custom Telegram channel @{raw_username}",
        "member_count": 5000,
        "is_monitored": True,
        "last_scraped_at": None,
        "category": req.category or "Custom Monitored"
    }

    store.channels[new_id] = new_channel
    return new_channel

@router.post("/{channel_id}/toggle-monitoring")
async def toggle_channel_monitoring(channel_id: str):
    """Toggle monitoring state for a channel."""
    if channel_id not in store.channels:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    current = store.channels[channel_id]["is_monitored"]
    store.channels[channel_id]["is_monitored"] = not current
    return {
        "channel_id": channel_id,
        "is_monitored": store.channels[channel_id]["is_monitored"]
    }
