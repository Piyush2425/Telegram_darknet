from fastapi import APIRouter, HTTPException
from typing import List
from ..db.mongodb import store
from ..db.models import Channel

router = APIRouter(prefix="/channels", tags=["Channels"])

@router.get("", response_model=List[Channel])
async def list_channels():
    """List all available Telegram channels & groups."""
    return list(store.channels.values())

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
