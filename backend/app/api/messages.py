import csv
import re
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional, Dict, Any
from pathlib import Path
from ..db.mongodb import store
from ..db.models import Message
from ..config import settings

logger = logging.getLogger("darknet_monitor.api.messages")
router = APIRouter(prefix="/messages", tags=["Messages"])

IST = timezone(timedelta(hours=5, minutes=30))

def _safe_name(s: str) -> str:
    s = re.sub(r"\W+", "_", (s or "").strip())
    s = s.strip("_")
    return s[:80] if s else "target"

def _extract_date_str(val: Any) -> str:
    """Extract YYYY-MM-DD in IST timezone from ISO string, datetime, or fallback string."""
    if not val:
        return datetime.now(IST).strftime("%Y-%m-%d")
    if isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=timezone.utc)
        return val.astimezone(IST).strftime("%Y-%m-%d")
    s = str(val).strip()
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.astimezone(IST).strftime("%Y-%m-%d")
    except Exception:
        if len(s) >= 10 and s[4] == '-' and s[7] == '-':
            return s[:10]
        return s[:10]

def _format_ordinal_date(date_str: str) -> str:
    """Format YYYY-MM-DD to '20th Aug 2026' or '19th Aug 2026'."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        day = dt.day
        if 11 <= (day % 100) <= 13:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
        return dt.strftime(f"{day}{suffix} %b %Y")
    except Exception:
        return date_str

def _format_short_day(date_str: str) -> str:
    """Format YYYY-MM-DD to '20th Aug'."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        day = dt.day
        if 11 <= (day % 100) <= 13:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
        return dt.strftime(f"{day}{suffix} %b")
    except Exception:
        return date_str


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


@router.get("/daily-stats")
async def get_daily_message_stats(
    channel_id: Optional[str] = None,
    limit_days: int = Query(0, description="Max days of history to return (0 for all)")
):
    """
    Return daily message scraping stats, showcasing how many messages were scraped per day
    (e.g., 20th Aug, 19th Aug), 1-day today telemetry vs yesterday, and threat breakdowns.
    """
    from ..db.mongodb import db, mongo_available
    
    daily_map: Dict[str, Dict[str, Any]] = {}
    
    # 1. Check MongoDB if active
    if mongo_available and db is not None:
        try:
            match_stage = {}
            if channel_id:
                match_stage["channel_id"] = channel_id
            
            pipeline = []
            if match_stage:
                pipeline.append({"$match": match_stage})
                
            pipeline.append({
                "$group": {
                    "_id": {
                        "date": {"$substr": ["$date", 0, 10]},
                        "threat_level": "$threat_level",
                        "channel_id": "$channel_id",
                        "channel_title": "$channel_username"
                    },
                    "count": {"$sum": 1}
                }
            })
            cursor = db.messages.aggregate(pipeline)
            async for doc in cursor:
                d_id = doc["_id"]
                d_str = d_id.get("date")
                if not d_str or len(d_str) < 10:
                    continue
                d_str = d_str[:10]
                th = (d_id.get("threat_level") or "LOW").upper()
                c_id = d_id.get("channel_id") or "unknown"
                c_title = d_id.get("channel_title") or c_id
                cnt = doc.get("count", 0)
                
                if d_str not in daily_map:
                    daily_map[d_str] = {
                        "count": 0,
                        "channels": {},
                        "threat_levels": {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
                    }
                daily_map[d_str]["count"] += cnt
                daily_map[d_str]["threat_levels"][th] = daily_map[d_str]["threat_levels"].get(th, 0) + cnt
                if c_id not in daily_map[d_str]["channels"]:
                    daily_map[d_str]["channels"][c_id] = {"id": c_id, "title": c_title, "count": 0}
                daily_map[d_str]["channels"][c_id]["count"] += cnt
        except Exception as e:
            logger.error(f"Error aggregating daily stats from MongoDB: {e}")

    # 2. Merge from In-Memory store if mongo was offline or empty
    for m in store.messages.values():
        if channel_id and m.get("channel_id") != channel_id:
            continue
        d_str = _extract_date_str(m.get("date"))
        th = (m.get("threat_level") or "LOW").upper()
        c_id = m.get("channel_id", "unknown")
        c_title = m.get("channel_username") or store.channels.get(c_id, {}).get("title", c_id)
        
        if d_str not in daily_map:
            daily_map[d_str] = {
                "count": 0,
                "channels": {},
                "threat_levels": {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
            }
        if not mongo_available or db is None:
            daily_map[d_str]["count"] += 1
            daily_map[d_str]["threat_levels"][th] = daily_map[d_str]["threat_levels"].get(th, 0) + 1
            if c_id not in daily_map[d_str]["channels"]:
                daily_map[d_str]["channels"][c_id] = {"id": c_id, "title": c_title, "count": 0}
            daily_map[d_str]["channels"][c_id]["count"] += 1

    # 3. Also scan CSV files on disk (backup/parity check)
    if not daily_map and settings.DATA_DIR.exists():
        for ch_dir in settings.DATA_DIR.iterdir():
            if not ch_dir.is_dir() or ch_dir.name in ["media", "reports"]:
                continue
            chats_dir = ch_dir / "chats"
            if not chats_dir.exists():
                continue
            
            # Resolve channel
            ch_title = ch_dir.name
            target_ch_id = ch_dir.name
            for cid, cinfo in store.channels.items():
                if cid == ch_dir.name or _safe_name(cinfo.get("title", "")) == ch_dir.name:
                    target_ch_id = cid
                    ch_title = cinfo.get("title", ch_title)
                    break
            
            if channel_id and target_ch_id != channel_id and ch_dir.name != channel_id:
                continue

            for csv_path in chats_dir.glob("messages_*.csv"):
                m_match = re.search(r"messages_(\d{4}-\d{2}-\d{2})\.csv", csv_path.name)
                if not m_match:
                    continue
                d_str = m_match.group(1)
                try:
                    with open(csv_path, "r", encoding="utf-8") as f:
                        reader = csv.reader(f)
                        rows = list(reader)
                    if len(rows) > 1:
                        count = len(rows) - 1
                        if d_str not in daily_map:
                            daily_map[d_str] = {
                                "count": 0,
                                "channels": {},
                                "threat_levels": {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
                            }
                        daily_map[d_str]["count"] += count
                        if target_ch_id not in daily_map[d_str]["channels"]:
                            daily_map[d_str]["channels"][target_ch_id] = {"id": target_ch_id, "title": ch_title, "count": 0}
                        daily_map[d_str]["channels"][target_ch_id]["count"] += count
                        
                        for r in rows[1:]:
                            if len(r) >= 6:
                                th = (r[5] if r[5] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"] else "LOW").upper()
                                daily_map[d_str]["threat_levels"][th] = daily_map[d_str]["threat_levels"].get(th, 0) + 1
                except Exception:
                    pass

    # Build sorted result list
    sorted_dates = sorted(daily_map.keys(), reverse=True)
    if limit_days > 0:
        sorted_dates = sorted_dates[:limit_days]

    today_str = datetime.now(IST).strftime("%Y-%m-%d")
    yesterday_str = (datetime.now(IST) - timedelta(days=1)).strftime("%Y-%m-%d")

    today_count = daily_map.get(today_str, {}).get("count", 0)
    yesterday_count = daily_map.get(yesterday_str, {}).get("count", 0)
    
    daily_items = []
    total_msgs = 0
    peak_count = 0
    peak_date = None

    for d_str in sorted_dates:
        entry = daily_map[d_str]
        cnt = entry["count"]
        total_msgs += cnt
        if cnt > peak_count:
            peak_count = cnt
            peak_date = d_str

        channels_list = list(entry["channels"].values())
        channels_list.sort(key=lambda x: x["count"], reverse=True)

        daily_items.append({
            "date": d_str,
            "formatted_date": _format_ordinal_date(d_str),
            "display_day": _format_short_day(d_str),
            "count": cnt,
            "channel_count": len(channels_list),
            "threat_levels": entry["threat_levels"],
            "top_channels": channels_list[:5]
        })

    return {
        "today_date": today_str,
        "today_formatted": _format_ordinal_date(today_str),
        "today_count": today_count,
        "yesterday_count": yesterday_count,
        "total_messages": total_msgs,
        "days_recorded": len(daily_map),
        "peak_day": {
            "date": peak_date,
            "formatted_date": _format_ordinal_date(peak_date) if peak_date else "N/A",
            "count": peak_count
        } if peak_date else None,
        "daily_stats": daily_items
    }


@router.get("/global-search")
async def global_search_messages(
    q: str = Query("", description="Keyword to search across all channel messages"),
    threat_level: Optional[str] = Query(None, description="Filter by threat level: LOW, MEDIUM, HIGH, CRITICAL"),
    date: Optional[str] = Query(None, description="Filter by date YYYY-MM-DD"),
    fuzzy: bool = Query(False, description="Enable fuzzy obfuscation / leetspeak matching"),
    page: int = Query(1, description="Page number to fetch"),
    limit: int = Query(50, description="Maximum results per page")
):
    """Search across ALL channel messages simultaneously using fast MongoDB indexing."""
    if not q or not q.strip():
        return {"results": [], "has_more": False}

    q_clean = q.strip()
    from ..db.mongodb import db, mongo_available
    
    skip = (page - 1) * limit
    fetch_limit = limit + 1
    
    if mongo_available and db is not None:
        query: Dict[str, Any] = {}
        if threat_level:
            query["threat_level"] = threat_level.upper()
        if date:
            query["date"] = {"$regex": f"^{date}"}

        if fuzzy:
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
            query["$or"] = [
                {"text": {"$regex": pattern_str, "$options": "i"}},
                {"sender": {"$regex": pattern_str, "$options": "i"}}
            ]
        else:
            query["$text"] = {"$search": q_clean}
            
        cursor = db.messages.find(query).sort("date", -1).skip(skip).limit(fetch_limit)
        results = await cursor.to_list(length=fetch_limit)
        
        for r in results:
            r.pop("_id", None)
            
        has_more = len(results) > limit
        if has_more:
            results = results[:limit]
            
        return {"results": results, "has_more": has_more}

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
    if date:
        results = [m for m in results if str(m.get("date", "")).startswith(date)]
    results.sort(key=lambda x: x.get("date", ""), reverse=True)
    
    page_results = results[skip : skip + fetch_limit]
    has_more = len(page_results) > limit
    if has_more:
        page_results = page_results[:limit]
        
    return {"results": page_results, "has_more": has_more}


def _load_messages_from_csv(channel_id: str, channel_title: str, target_date: Optional[str] = None) -> List[dict]:
    """Load and parse messages from CSV file for the channel."""
    messages = []
    def _try_load(chats_dir):
        loaded = []
        if chats_dir.exists():
            pattern = f"messages_{target_date}.csv" if target_date else "messages_*.csv"
            for csv_path in sorted(chats_dir.glob(pattern)):
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
        if safe_title:
            messages = _try_load(settings.DATA_DIR / safe_title / "chats")
        if not messages:
            messages = _try_load(settings.DATA_DIR / channel_id / "chats")
    except Exception:
        pass
    return messages


@router.get("", response_model=List[Message])
async def get_messages(
    channel_id: Optional[str] = None,
    threat_level: Optional[str] = None,
    date: Optional[str] = Query(None, description="Filter messages by specific date YYYY-MM-DD"),
    search: Optional[str] = None,
    fuzzy: bool = Query(False, description="Enable fuzzy obfuscation / leetspeak matching")
):
    """Retrieve collected messages with filtering and searching via MongoDB or CSV/memory fallback."""
    from ..db.mongodb import db, mongo_available
    
    if mongo_available and db is not None:
        query: Dict[str, Any] = {}
        if channel_id:
            query["channel_id"] = channel_id
        if threat_level:
            query["threat_level"] = threat_level.upper()
        if date:
            query["date"] = {"$regex": f"^{date}"}
            
        if search and search.strip():
            q_clean = search.strip()
            if fuzzy:
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
                query["$or"] = [
                    {"text": {"$regex": pattern_str, "$options": "i"}},
                    {"sender": {"$regex": pattern_str, "$options": "i"}}
                ]
            else:
                query["$text"] = {"$search": q_clean}
            
        cursor = db.messages.find(query).sort("date", -1).limit(500)
        results = await cursor.to_list(length=500)
        for r in results:
            r.pop("_id", None)
        return results

    # Fallback in-memory logic
    msgs = list(store.messages.values())

    # Check if we have messages in memory for this specific channel
    channel_msgs_in_memory = [m for m in msgs if m["channel_id"] == channel_id] if channel_id else msgs

    if channel_id and not channel_msgs_in_memory and channel_id in store.channels:
        ch = store.channels[channel_id]
        csv_msgs = _load_messages_from_csv(channel_id, ch["title"], date)
        for m in csv_msgs:
            store.messages[m["id"]] = m
        msgs = list(store.messages.values())

    # Apply filters
    if channel_id:
        msgs = [m for m in msgs if m["channel_id"] == channel_id]
    if threat_level:
        msgs = [m for m in msgs if m["threat_level"].upper() == threat_level.upper()]
    if date:
        msgs = [m for m in msgs if str(m.get("date", "")).startswith(date)]
    if search:
        s_lower = search.lower()
        msgs = [
            m for m in msgs 
            if s_lower in m["text"].lower() or s_lower in m.get("sender", "").lower()
        ]

    # Sort newest first
    msgs.sort(key=lambda x: str(x.get("date", "")), reverse=True)
    return msgs
