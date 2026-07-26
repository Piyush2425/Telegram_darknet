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
        
        # 1. Run first cycle ledger updates
        await update_url_ioc_ledger("test_ch", "Test Channel", messages, reports_dir)
        
        state_path = reports_dir / "url.state.json"
        md_path = reports_dir / "url.md"
        
        assert state_path.exists()
        assert md_path.exists()
        
        # Verify merged state details
        with open(state_path, "r", encoding="utf-8") as f:
            state = json.load(f)
            
        indicators = state["indicators"]
        assert len(indicators) >= 3 # df.sh (Web URL), darkforum.sh (Bare Domain), admin@shadowgroup.xyz (Email)
        
        # Verify mention counts: df.sh is seen twice
        df_sh_indicators = [ind for ind in indicators if "df.sh" in ind["value"].lower()]
        assert len(df_sh_indicators) > 0
        # First or last occurrence count gets merged correctly
        total_mentions = sum(ind["count"] for ind in df_sh_indicators)
        assert total_mentions >= 2
        
        # Verify markdown contents
        with open(md_path, "r", encoding="utf-8") as f:
            md_content = f.read()
        assert "Cyber Threat Intelligence URL Ledger" in md_content
        assert "df.sh" in md_content
        assert "shadowgroup.xyz" in md_content
        
    finally:
        # Cleanup
        shutil.rmtree(temp_dir)
