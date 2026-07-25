import pytest
import os
import sys
from fastapi.testclient import TestClient

# Ensure backend root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.db.mongodb import store

@pytest.fixture(autouse=True)
def clean_store():
    """Clear memory database store mock state before each test run."""
    store.channels.clear()
    store.messages.clear()
    store.reports.clear()
    
    # Initialize basic default channels for testing
    store.channels["-1004350724129"] = {
        "id": "-1004350724129",
        "title": "Private Threat Intel Group",
        "username": "private_threat_group",
        "raw_username": "private_threat_group",
        "is_monitored": True,
        "status": "idle",
        "message_count": 0,
        "scrape_interval_mins": 30,
        "ai_interval_mins": 60,
        "report_interval_mins": 1440
    }
    yield
    
@pytest.fixture
def client():
    """Provide FastAPI test client fixture."""
    return TestClient(app)
