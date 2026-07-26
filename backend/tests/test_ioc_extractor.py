# pyrefly: ignore [missing-import]
import pytest
from app.llm.ioc_extractor import extract_indicators_hybrid
from app.scrapers.scheduler import update_url_ioc_ledger
from pathlib import Path
import tempfile
import shutil
import json

def test_extract_indicators_standard_and_normalized():
    text = "Visit https://sub.example.com/some/path?param=1 and check search page www.google.com/search"
    results = extract_indicators_hybrid(text)
    
    # Verify standard URLs are found
    web_urls = [r for r in results if r["type"] == "Web URL"]
    assert len(web_urls) >= 2
    
    # Verify normalization (e.g. sub.example.com -> example.com, www.google.com -> google.com)
    normalized = [r["normalized"] for r in web_urls]
    assert "example.com" in normalized
    assert "google.com" in normalized

def test_extract_indicators_onion_links():
    text = "Find leak mirror link at: darkforum5qewpzn.onion/index.html or http://anotheronion6qewpzn.onion"
    results = extract_indicators_hybrid(text)
    
    onions = [r for r in results if r["type"] == "Onion"]
    assert len(onions) >= 2
    
    normalized = [r["normalized"] for r in onions]
    assert "darkforum5qewpzn.onion" in normalized or "onion" in normalized

def test_extract_indicators_emails_and_ips():
    text = "Email admin@shadowgroup.xyz or helper@df.sh for host 192.168.1.254"
    results = extract_indicators_hybrid(text)
    
    emails = [r for r in results if r["type"] == "Email"]
    assert len(emails) == 2
    assert emails[0]["normalized"] == "shadowgroup.xyz"
    assert emails[1]["normalized"] == "df.sh"
    
    ips = [r for r in results if r["type"] == "IP"]
    assert len(ips) == 1
    assert ips[0]["value"] == "192.168.1.254"

def test_extract_indicators_bare_domains_edge_cases():
    text = "Use mirror: df.sh or darkforum.sh or example.xyz/forum"
    results = extract_indicators_hybrid(text)
    
    bare_domains = [r for r in results if r["type"] == "Bare Domain"]
    assert len(bare_domains) >= 3
    
    normalized = [r["normalized"] for r in bare_domains]
    assert "df.sh" in normalized
    assert "darkforum.sh" in normalized
    assert "example.xyz" in normalized

@pytest.mark.anyio
async def test_update_url_ioc_ledger_integration():
    # Setup temporary directory for ledger tests
    temp_dir = tempfile.mkdtemp()
    reports_dir = Path(temp_dir)
    
    try:
        messages = [
            {"id": "msg_1", "text": "Leaked details posted on http://df.sh/forum and mirror darkforum.sh"},
            {"id": "msg_2", "text": "Contact admin@shadowgroup.xyz or check http://df.sh/forum again"}
        ]
        
        # Mock LLM findings matching cycle format
        llm_findings = {
            "urls": [
                "http://df.sh/forum",
                "https://malicious-gateway.net/exploit"
            ],
            "onions": [
                "leakonion6qewpzn.onion"
            ],
            "iocs": [
                "192.168.10.15",
                "CVE-2026-9999"
            ]
        }
        
        # 1. Run cycle ledger updates with both new messages and LLM findings
        await update_url_ioc_ledger("test_ch", "Test Channel", messages, reports_dir, llm_findings)
        
        state_path = reports_dir / "url.state.json"
        md_path = reports_dir / "url.md"
        
        assert state_path.exists()
        assert md_path.exists()
        
        # Verify merged state details
        with open(state_path, "r", encoding="utf-8") as f:
            state = json.load(f)
            
        indicators = state["indicators"]
        assert len(indicators) > 0
        
        # Verify source division
        extractor_items = [ind for ind in indicators if ind["source"] == "Extractor"]
        llm_items = [ind for ind in indicators if ind["source"] == "LLM"]
        
        assert len(extractor_items) >= 3  # df.sh, darkforum.sh, admin@shadowgroup.xyz
        assert len(llm_items) >= 5        # df.sh, malicious-gateway.net, leakonion6qewpzn.onion, IP, CVE
        
        # Verify specific LLM items are normalized and categorized correctly
        llm_ips = [ind for ind in llm_items if ind["type"] == "IP"]
        assert len(llm_ips) == 1
        assert llm_ips[0]["value"] == "192.168.10.15"
        
        llm_onions = [ind for ind in llm_items if ind["type"] == "Onion"]
        assert len(llm_onions) == 1
        assert "leakonion6qewpzn.onion" in llm_onions[0]["value"]
        
        # Verify markdown contains separate tables/sections
        with open(md_path, "r", encoding="utf-8") as f:
            md_content = f.read()
        assert "Deterministic Extractor Indicators" in md_content
        assert "LLM AI Extracted Indicators" in md_content
        
        # df.sh exists under both headers
        assert "df.sh" in md_content
        
    finally:
        # Cleanup
        shutil.rmtree(temp_dir)
