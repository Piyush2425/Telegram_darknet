#!/usr/bin/env python3

import os
import json
import asyncio
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from telethon.sync import TelegramClient
from telethon import functions, types, errors
import aiofiles
import csv


def load_env_file():
    """Load simple KEY=VALUE pairs from backend/.env if it exists."""
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return

    with env_path.open("r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


load_env_file()

# Configuration file paths
CONFIG_DIR = os.path.expanduser("~/.darknet_monitor")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.enc")
SESSION_NAME = "darknet_monitor"
OUTPUT_DIR = os.path.join(CONFIG_DIR, "output")

# Ensure directories exist
os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def _safe_folder_name(value):
    cleaned = "".join(character if character.isalnum() or character in ("-", "_") else "_" for character in str(value or "channel")).strip("_")
    return cleaned or "channel"


def _channel_output_dir(channel_id, channel_title):
    return os.path.join(OUTPUT_DIR, f"{channel_id}_{_safe_folder_name(channel_title)}")


def _normalize_tme_link(channel_link):
    """Return a parsed Telegram URL or path for a public or invite link."""
    raw_link = (channel_link or "").strip()
    if not raw_link:
        raise ValueError("Channel link is required")
    if raw_link.startswith("t.me/"):
        raw_link = "https://" + raw_link
    parsed = urlparse(raw_link)
    if parsed.netloc and parsed.netloc != "t.me":
        raise ValueError("Invalid Telegram link")
    path = parsed.path.lstrip("/")
    if not path:
        raise ValueError("Invalid Telegram link")
    return parsed, path

class DarknetMonitor:
    def __init__(self):
        self.client = None
        self.api_id = None
        self.api_hash = None
        self.phone = None
        self.credentials_loaded = False

    def load_credentials_from_env(self):
        """Load credentials from environment variables."""
        api_id = os.getenv("TELEGRAM_API_ID")
        api_hash = os.getenv("TELEGRAM_API_HASH")
        phone = os.getenv("TELEGRAM_PHONE")

        if not all([api_id, api_hash, phone]):
            return False

        self.api_id = api_id
        self.api_hash = api_hash
        self.phone = phone
        self.credentials_loaded = True
        return True
        
    def load_credentials(self):
        """Load encrypted credentials from config file"""
        try:
            if self.load_credentials_from_env():
                return True

            if os.path.exists(CONFIG_PATH):
                # In a real implementation, this would decrypt the credentials
                # For now, we'll simulate loading from an encrypted file
                with open(CONFIG_PATH, 'r') as f:
                    data = json.load(f)
                    self.api_id = data.get('api_id')
                    self.api_hash = data.get('api_hash')
                    self.phone = data.get('phone')
                    self.credentials_loaded = True
                return True
            return False
        except Exception as e:
            print(f"Error loading credentials: {e}")
            return False
    
    def save_credentials(self, api_id, api_hash, phone):
        """Save credentials to encrypted config file"""
        try:
            # In a real implementation, this would encrypt the credentials
            # For now, we'll simulate saving to an encrypted file
            data = {
                'api_id': api_id,
                'api_hash': api_hash,
                'phone': phone
            }
            with open(CONFIG_PATH, 'w') as f:
                json.dump(data, f)
            self.api_id = api_id
            self.api_hash = api_hash
            self.phone = phone
            self.credentials_loaded = True
            return True
        except Exception as e:
            print(f"Error saving credentials: {e}")
            return False
    
    async def initialize_client(self):
        """Initialize the Telegram client"""
        if not self.credentials_loaded:
            return False
            
        try:
            self.client = TelegramClient(
                os.path.join(CONFIG_DIR, SESSION_NAME), 
                self.api_id, 
                self.api_hash
            )
            await self.client.start()
            return True
        except Exception as e:
            print(f"Error initializing client: {e}")
            return False
    
    async def add_channel(self, channel_link):
        """Add a channel to monitor"""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}
            
        try:
            _, channel_name = _normalize_tme_link(channel_link)

            if channel_name.startswith("+") or "joinchat" in channel_name:
                invite_code = channel_name.split("/")[-1].lstrip("+")
                updates = await self.client(functions.messages.ImportChatInviteRequest(invite_code))
                entity = updates.chats[0] if getattr(updates, "chats", None) else await self.client.get_entity(channel_name)
            else:
                entity = await self.client.get_entity(channel_name)
            
            # Save channel info
            channels_file = os.path.join(CONFIG_DIR, "channels.json")
            channels = []
            if os.path.exists(channels_file):
                with open(channels_file, 'r') as f:
                    channels = json.load(f)
            
            # Check if channel already exists
            channel_exists = any(c['id'] == entity.id for c in channels)
            if not channel_exists:
                channels.append({
                    'id': entity.id,
                    'title': getattr(entity, 'title', 'Unknown'),
                    'username': getattr(entity, 'username', None),
                    'link': channel_link,
                    'added_date': datetime.now().isoformat()
                })
                
                with open(channels_file, 'w') as f:
                    json.dump(channels, f, indent=2)
            
            return {"success": True, "channel": {
                'id': entity.id,
                'title': getattr(entity, 'title', 'Unknown'),
                'username': getattr(entity, 'username', None),
                'link': channel_link
            }}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_channels(self):
        """Get all monitored channels"""
        channels_file = os.path.join(CONFIG_DIR, "channels.json")
        if os.path.exists(channels_file):
            with open(channels_file, 'r') as f:
                return json.load(f)
        return []
    
    async def remove_channel(self, channel_id):
        """Remove a channel from monitoring"""
        channels_file = os.path.join(CONFIG_DIR, "channels.json")
        if os.path.exists(channels_file):
            with open(channels_file, 'r') as f:
                channels = json.load(f)
            
            channels = [c for c in channels if c['id'] != channel_id]
            
            with open(channels_file, 'w') as f:
                json.dump(channels, f, indent=2)
            
            return True
        return False
    
    async def scrape_messages(self, channel_id, limit=None):
        """Scrape messages from a channel"""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}
            
        try:
            # Find the channel
            channels = await self.get_channels()
            channel = next((c for c in channels if c['id'] == channel_id), None)
            
            if not channel:
                return {"success": False, "error": "Channel not found"}
            
            entity = await self._resolve_channel_entity(channel['link'])
            
            # Scrape messages
            messages = []
            async for message in self.client.iter_messages(entity, limit=limit):
                messages.append({
                    'id': message.id,
                    'date': message.date.isoformat() if message.date else None,
                    'sender_id': message.sender_id,
                    'text': message.text,
                    'media': message.media is not None
                })
            
            channel_dir = _channel_output_dir(channel_id, channel.get('title') or channel.get('username'))
            os.makedirs(channel_dir, exist_ok=True)
            filename = "messages.csv"
            filepath = os.path.join(channel_dir, filename)
            
            with open(filepath, 'w', newline='', encoding='utf-8') as csvfile:
                fieldnames = ['id', 'date', 'sender_id', 'text', 'media']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                for msg in messages:
                    writer.writerow(msg)
            
            return {"success": True, "count": len(messages), "file": filename}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def scrape_members(self, channel_id):
        """Scrape members from a channel or forum-enabled group."""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}

        try:
            channels = await self.get_channels()
            channel = next((c for c in channels if c['id'] == channel_id), None)

            if not channel:
                return {"success": False, "error": "Channel not found"}

            entity = await self._resolve_channel_entity(channel['link'])
            members = []
            async for user in self.client.iter_participants(entity, aggressive=True):
                full_name = " ".join(
                    part for part in [getattr(user, 'first_name', ''), getattr(user, 'last_name', '')] if part
                ).strip()
                members.append({
                    'user_id': user.id,
                    'username': getattr(user, 'username', None) or '',
                    'name': full_name,
                    'profile_link': f"https://t.me/{user.username}" if getattr(user, 'username', None) else '',
                    'phone': getattr(user, 'phone', None) or '',
                })

            channel_dir = _channel_output_dir(channel_id, channel.get('title') or channel.get('username'))
            os.makedirs(channel_dir, exist_ok=True)
            filepath = os.path.join(channel_dir, "members.csv")

            with open(filepath, 'w', newline='', encoding='utf-8') as csvfile:
                fieldnames = ['user_id', 'username', 'name', 'profile_link', 'phone']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                for member in members:
                    writer.writerow(member)

            return {"success": True, "count": len(members), "file": "members.csv"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _resolve_channel_entity(self, channel_link):
        """Resolve a saved channel link, including Telegram invite links."""
        _, channel_name = _normalize_tme_link(channel_link)

        if channel_name.startswith("+") or "joinchat" in channel_name:
            invite_code = channel_name.split("/")[-1].lstrip("+")
            try:
                updates = await self.client(functions.messages.ImportChatInviteRequest(invite_code))
                if getattr(updates, 'chats', None):
                    return updates.chats[0]
            except Exception:
                pass

        return await self.client.get_entity(channel_name)
    
# Create a global instance
monitor = DarknetMonitor()
