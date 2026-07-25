import pytest
from datetime import datetime

def merge_extracted_urls(state, extracted_urls, now_time_str):
    """Helper representing the exact url state merging algorithm from scheduler.py."""
    normalized_urls = []
    for item in extracted_urls:
        if isinstance(item, str):
            normalized_urls.append({"url": item, "purpose": "Web link shared in chat"})
        elif isinstance(item, dict):
            url_val = item.get("url") or item.get("link")
            if url_val:
                normalized_urls.append({
                    "url": str(url_val),
                    "purpose": str(item.get("purpose") or "Shared web link")
                })
                
    for item in normalized_urls:
        found = False
        for exist in state["urls"]:
            if exist["url"].lower() == item["url"].lower():
                exist["count"] = exist.get("count", 1) + 1
                exist["last_seen"] = now_time_str
                found = True
                break
        if not found:
            state["urls"].append({
                "url": item["url"],
                "purpose": item["purpose"],
                "count": 1,
                "last_seen": now_time_str
            })

def test_ledger_url_deduplication():
    # Initial daily state
    state = {
        "urls": [
            {"url": "https://leakforum.com", "purpose": "Leaked database repository", "count": 1, "last_seen": "12:00:00"}
        ]
    }
    
    now_time_str = "13:30:15"
    new_urls = ["https://leakforum.com", "https://newsite.xyz"]
    
    merge_extracted_urls(state, new_urls, now_time_str)
    
    # Verify leakforum.com count was incremented and last_seen updated
    leakforum_entry = next(u for u in state["urls"] if u["url"] == "https://leakforum.com")
    assert leakforum_entry["count"] == 2
    assert leakforum_entry["last_seen"] == now_time_str
    
    # Verify newsite.xyz was added with count 1
    newsite_entry = next(u for u in state["urls"] if u["url"] == "https://newsite.xyz")
    assert newsite_entry["count"] == 1
    assert newsite_entry["last_seen"] == now_time_str
