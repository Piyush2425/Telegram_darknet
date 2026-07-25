import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import os
import shutil
from pathlib import Path
from app.db.mongodb import store

# 1. Test offline LLM fallback
@patch("httpx.post")
def test_llm_offline_fallback(mock_post):
    # Mock httpx.post to raise a connection error (simulating Ollama offline)
    import httpx
    mock_post.side_effect = httpx.ConnectError("Connection refused")
    
    from app.llm.threat_analyzer import analyzer
    # Run analysis passing a dict with 'text'
    msg_dict = {"text": "Urgent threat alert: CVE-2024-38063 detected."}
    result = analyzer.analyze_message(msg_dict)
    
    # Verify we still get extracted CVE using the deterministic regex fallback!
    assert "CVE-2024-38063" in result["cves"]
    assert result["threat_level"] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

# 2. Test directory auto-recreation
def test_data_directory_recreation(tmp_path):
    # Create temporary path
    test_ch_id = "test_resilient_ch"
    test_data_dir = tmp_path / test_ch_id
    
    # Make sure it does not exist
    if test_data_dir.exists():
        shutil.rmtree(test_data_dir)
        
    # Mock settings DATA_DIR to use tmp_path
    with patch("app.config.settings.DATA_DIR", tmp_path):
        from app.scrapers.telegram_scraper import telegram_scraper
        # Test writing messages to CSV recreates directories automatically
        dummy_messages = [{
            "id": "msg_test_1",
            "date": "2026-07-25T12:00:00Z",
            "sender": "test_sender",
            "text": "Threat Intelligence text example"
        }]
        telegram_scraper._write_messages_to_csv(test_ch_id, dummy_messages)
        
        # Verify folder was automatically recreated and CSV written!
        csv_dir = test_data_dir / "chats"
        assert csv_dir.exists()
        assert len(list(csv_dir.glob("messages_*.csv"))) > 0

# 3. Test scraper connection error resilience
@pytest.mark.asyncio
async def test_scraper_resilience_on_error():
    from app.scrapers.telegram_scraper import telegram_scraper
    
    # Setup channel in store
    store.channels["-999"] = {
        "id": "-999",
        "title": "Broken Network Channel",
        "is_monitored": True,
        "status": "idle"
    }
    
    # Mock client and locks to raise a connection error during scraping
    with patch.object(telegram_scraper, "get_connected_client", AsyncMock(side_effect=Exception("Socket disconnect"))):
        # Trigger scrape and expect exception to be raised
        with pytest.raises(Exception):
            await telegram_scraper.scrape_channels([{"id": "-999", "title": "Broken Network Channel"}])
        
        # Verify status reset to idle instead of staying "scraping"
        assert store.channels["-999"]["status"] == "idle"
