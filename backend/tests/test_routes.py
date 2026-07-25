import pytest
from app.db.mongodb import store

def test_get_channels(client):
    response = client.get("/api/channels")
    assert response.status_code == 200
    channels_list = response.json()
    assert len(channels_list) > 0
    assert channels_list[0]["id"] == "-1004350724129"

def test_post_channel_creation(client):
    payload = {
        "username": "malware_lab",
        "title": "Malware Research Lab"
    }
    response = client.post("/api/channels/add", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert data["username"] == "@malware_lab"

def test_delete_channel(client):
    # Insert a dummy channel
    store.channels["-12345"] = {
        "id": "-12345",
        "title": "Dummy Group",
        "username": "dummy_group",
        "raw_username": "dummy_group",
        "is_monitored": True
    }
    
    response = client.delete("/api/channels/-12345")
    assert response.status_code == 200
    assert "-12345" not in store.channels

def test_get_scraper_status(client):
    response = client.get("/api/scraper/status")
    assert response.status_code == 200
    status_data = response.json()
    assert "is_scraping" in status_data
    assert isinstance(status_data["logs"], list)
