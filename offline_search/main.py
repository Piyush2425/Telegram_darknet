import os
import re
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient, DESCENDING, TEXT, ASCENDING
from typing import List, Optional
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Standalone Offline Threat Intel Search Engine")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect to MongoDB
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "darknet_monitor")

try:
    client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=3000)
    db = client[DATABASE_NAME]
    # Ping to check connection
    client.admin.command("ping")
    mongo_available = True
    print(f"✅ Standalone Search connected to MongoDB successfully: {MONGODB_URL} (db: {DATABASE_NAME})")
except Exception as e:
    mongo_available = False
    db = None
    print(f"❌ Standalone Search failed to connect to MongoDB: {e}")

# Base folder for serving frontend static files
BASE_DIR = Path(__file__).resolve().parent

@app.get("/api/health")
async def health_check():
    return {
        "status": "online" if mongo_available else "offline",
        "database": DATABASE_NAME,
        "url": MONGODB_URL
    }

@app.get("/api/channels")
async def get_channels():
    """Dynamically aggregate channels and message counts directly from MongoDB messages."""
    if not mongo_available or db is None:
        return []
    
    try:
        pipeline = [
            {
                "$group": {
                    "_id": "$channel_id",
                    "id": {"$first": "$channel_id"},
                    "title": {"$first": "$channel_username"},
                    "username": {"$first": "$channel_username"},
                    "message_count": {"$sum": 1}
                }
            },
            {"$sort": {"message_count": DESCENDING}}
        ]
        cursor = db.messages.aggregate(pipeline)
        channels = list(cursor)
        for ch in channels:
            ch.pop("_id", None)
            if not ch.get("title"):
                ch["title"] = f"Channel {ch['id']}"
                ch["username"] = f"c_{ch['id']}"
        return channels
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database aggregation error: {e}")

@app.get("/api/search")
async def search_messages(
    q: Optional[str] = Query("", description="Keyword search term"),
    fuzzy: bool = Query(False, description="Enable fuzzy obfuscation matching"),
    threat_level: Optional[str] = Query(None, description="Filter by risk level"),
    channel_id: Optional[str] = Query(None, description="Filter by specific channel"),
    limit: int = Query(250, description="Max messages to return")
):
    """Stand-alone MongoDB query search matching global and local UI parameters."""
    if not mongo_available or db is None:
        raise HTTPException(status_code=503, detail="MongoDB database is offline")

    query = {}
    if channel_id:
        query["channel_id"] = channel_id
    if threat_level:
        query["threat_level"] = threat_level.upper()

    q_clean = (q or "").strip()
    if q_clean:
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
            # Use MongoDB text index search
            query["$text"] = {"$search": q_clean}

    try:
        cursor = db.messages.find(query).sort("date", -1).limit(limit)
        results = list(cursor)
        for r in results:
            r.pop("_id", None)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MongoDB query failed: {e}")

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = BASE_DIR / "index.html"
    if index_path.exists():
        return index_path.read_text(encoding="utf-8")
    return "<h3>Frontend index.html file not found in directory.</h3>"

if __name__ == "__main__":
    import uvicorn
    # Standalone search operates on port 8080 by default to prevent main project port collisions
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
