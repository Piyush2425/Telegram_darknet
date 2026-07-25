from fastapi import APIRouter
from typing import List, Dict, Any
from ..db.mongodb import store

router = APIRouter(prefix="/intelligence", tags=["Threat Intelligence"])

@router.get("/summary")
async def get_intelligence_summary():
    """Get aggregated threat metrics across all scraped darknet channels."""
    intels = list(store.threat_intel.values())

    all_cves = set()
    all_urls = set()
    all_iocs = set()
    all_wallets = set()
    all_credentials = set()
    all_malware = set()
    all_actors = set()

    for item in intels:
        all_cves.update(item.get("cves", []))
        all_urls.update(item.get("urls", []))
        all_iocs.update(item.get("iocs", []))
        all_wallets.update(item.get("crypto_wallets", []))
        all_credentials.update(item.get("leaked_credentials", []))
        all_malware.update(item.get("malware_references", []))
        all_actors.update(item.get("threat_actors", []))

    return {
        "total_analyzed": len(intels),
        "total_cves": len(all_cves),
        "cves_list": sorted(list(all_cves)),
        "total_iocs": len(all_iocs),
        "iocs_list": sorted(list(all_iocs)),
        "total_wallets": len(all_wallets),
        "crypto_wallets_list": sorted(list(all_wallets)),
        "total_credentials": len(all_credentials),
        "leaked_credentials_list": sorted(list(all_credentials)),
        "malware_families": sorted(list(all_malware)),
        "threat_actors": sorted(list(all_actors)),
        "urls_list": sorted(list(all_urls))
    }

@router.get("/items")
async def get_all_threat_items():
    """Retrieve itemized LLM intelligence records."""
    return list(store.threat_intel.values())
