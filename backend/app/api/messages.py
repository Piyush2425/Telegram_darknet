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


@router.get("/count")
async def get_message_count():
    """Return total message count and per-channel breakdown using fast MongoDB aggregations."""
    from ..db.mongodb import db, mongo_available
    
    total = 0
    per_channel = {}
    
    if mongo_available and db is not None:
        try:
            # Fast aggregation for channel counts
            pipeline = [{"$group": {"_id": "$channel_id", "count": {"$sum": 1}}}]
            cursor = db.messages.aggregate(pipeline)
            async for doc in cursor:
                ch = doc["_id"]
                c = doc["count"]
                per_channel[ch] = c
                total += c
        except Exception:
            pass

    # Fallback to in-memory store if mongo fails or is offline
    if total == 0:
        from collections import Counter
        counts = Counter(m.get("channel_id", "unknown") for m in store.messages.values())
        per_channel = dict(counts)
        total = sum(counts.values())

    return {
        "total_in_memory": total,
        "total_on_disk": total,
        "total": total,
        "per_channel_in_memory": per_channel,
        "per_channel_on_disk": per_channel,
    }



@router.get("/global-search")
async def global_search_messages(
    q: str = Query("", description="Keyword to search across all channel messages"),
    threat_level: Optional[str] = Query(None, description="Filter by threat level: LOW, MEDIUM, HIGH, CRITICAL"),
    fuzzy: bool = Query(False, description="Enable fuzzy obfuscation / leetspeak matching"),
    limit: int = Query(200, description="Maximum results to return")
):
    """Search across ALL channel messages simultaneously using fast MongoDB indexing."""
    if not q or not q.strip():
        return []

    q_clean = q.strip()
    from ..db.mongodb import db, mongo_available
    
    if mongo_available and db is not None:
        query = {}
        if threat_level:
            query["threat_level"] = threat_level.upper()

        if fuzzy:
            import re
            char_map = {
                'a': r'[aA4@\^]', 'b': r'[bB8]', 'c': r'[cC]', 'd': r'[dD]',
                'e': r'[eE3]', 'f': r'[fF]', 'g': r'[gG69]', 'h': r'[hH]',
                'i': r'[iIlL1!|]', 'j': r'[jJ]', 'k': r'[kK]', 'l': r'[lLiI1!|]',
                'm': r'[mM]', 'n': r'[nN]', 'o': r'[oO0]', 'p': r'[pP]',
                'q': r'[qQ]', 'r': r'[rR]', 's': r'[sS5$]', 't': r'[tT7+]',
                'u': r'[uU]', 'v': r'[vV]', 'w': r'[wW]', 'x': r'[xX]',
                'y': r'[yY]', 'z': r'[zZ2]'
            }
            pattern_str = ""
            for char in q_clean.lower():
                if char in char_map:
                    pattern_str += char_map[char]
                else:
                    pattern_str += re.escape(char)
            # Fuzzy Regex Search
            query["$or"] = [
                {"text": {"$regex": pattern_str, "$options": "i"}},
                {"sender": {"$regex": pattern_str, "$options": "i"}}
            ]
        else:
            # Exact Fast Text Search
            query["$text"] = {"$search": q_clean}
            
        cursor = db.messages.find(query).sort("date", -1).limit(limit)
        results = await cursor.to_list(length=limit)
        # Remove MongoDB _id before returning
        for r in results:
            r.pop("_id", None)
        return results

    # Fallback to in-memory search if MongoDB is offline
    msgs = list(store.messages.values())
    q_lower = q_clean.lower()
    results = [
        m for m in msgs
        if q_lower in (m.get("text") or "").lower()
        or q_lower in (m.get("sender") or "").lower()
    ]
    if threat_level:
        results = [m for m in results if m.get("threat_level", "").upper() == threat_level.upper()]
    results.sort(key=lambda x: x.get("date", ""), reverse=True)
    return results[:limit]



def _load_messages_from_csv(channel_id: str, channel_title: str) -> List[dict]:
    """Load and parse messages from CSV file for the channel."""
    messages = []
    def _try_load(chats_dir):
        loaded = []
        if chats_dir.exists():
            for csv_path in sorted(chats_dir.glob("messages_*.csv")):
                try:
                    with open(csv_path, "r", encoding="utf-8") as f:
                        reader = csv.reader(f)
                        rows = list(reader)
                    if len(rows) > 1:
                        for r in rows[1:]:
                            if len(r) >= 6:
                                loaded.append({
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
                except Exception:
                    pass
        return loaded

    try:
        safe_title = re.sub(r"\W+", "_", (channel_title or "").strip()).strip("_")[:80]
        # Try title-based folder first (new naming scheme)
        if safe_title:
            messages = _try_load(settings.DATA_DIR / safe_title / "chats")
        # Fallback to old numeric-ID folder
        if not messages:
            messages = _try_load(settings.DATA_DIR / channel_id / "chats")
    except Exception:
        pass
    return messages


@router.get("", response_model=List[Message])
async def get_messages(
    channel_id: Optional[str] = None,
    threat_level: Optional[str] = None,
    search: Optional[str] = None
):
    """Retrieve collected messages with filtering and searching via MongoDB."""
    from ..db.mongodb import db, mongo_available
    
    if mongo_available and db is not None:
        query = {}
        if channel_id:
            query["channel_id"] = channel_id
        if threat_level:
            query["threat_level"] = threat_level.upper()
        if search:
            query["text"] = {"$regex": search, "$options": "i"}
            
        cursor = db.messages.find(query).sort("date", -1).limit(500)
        results = await cursor.to_list(length=500)
        for r in results:
            r.pop("_id", None)
        return results

    # Fallback in-memory logic
    msgs = list(store.messages.values())

    # Check if we have messages in memory *for this specific channel*
    channel_msgs_in_memory = [m for m in msgs if m["channel_id"] == channel_id] if channel_id else msgs

    # Fallback to load from CSV if memory does not contain messages for this channel
    if channel_id and not channel_msgs_in_memory and channel_id in store.channels:
        ch = store.channels[channel_id]
        csv_msgs = _load_messages_from_csv(channel_id, ch["title"])
        for m in csv_msgs:
            store.messages[m["id"]] = m
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
