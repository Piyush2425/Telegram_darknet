import os
import csv
import re
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from ..config import settings
from ..db.mongodb import store

logger = logging.getLogger("darknet_monitor.scraper")

# Try Telethon import
telethon_available = False
try:
    from telethon import TelegramClient
    from telethon.tl.types import Channel as TelethonChannel, Chat as TelethonChat, User as TelethonUser
    from telethon.errors import SessionPasswordNeededError, RPCError, ApiIdInvalidError, PhoneNumberInvalidError
    telethon_available = True
except ImportError:
    telethon_available = False

class TelegramScraper:
    """Telegram Scraper with first-time full scraping and incremental update checks."""

    def __init__(self):
        self.is_scraping = False
        self.progress = 0
        self.current_channel = ""
        self.logs: List[str] = []
        self.client: Optional[Any] = None
        self.auth_client: Optional[Any] = None
        self.phone_code_hash: Optional[str] = None
        self.active_phone: Optional[str] = None
        self._lock = asyncio.Lock()
        # Queue tracking for multi-channel progress panel
        self.scrape_queue: List[str] = []      # channel titles yet to be scraped
        self.completed_channels: List[str] = [] # channel titles finished
        self.total_channels_count: int = 0

    def log(self, message: str):
        ist = timezone(timedelta(hours=5, minutes=30))
        timestamp = datetime.now(ist).strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self.logs.append(log_entry)
        if len(self.logs) > 100:
            self.logs.pop(0)
        logger.info(log_entry)

    def _cleanup_corrupted_session(self):
        """Remove leftover/corrupted Telethon session files to reset MTProto auth key."""
        session_base = settings.BASE_DIR / "darknet_session"
        for ext in [".session", ".session-journal"]:
            p = Path(str(session_base) + ext)
            if p.exists():
                try:
                    p.unlink()
                    self.log(f"Cleaned up session file: {p.name}")
                except Exception as e:
                    logger.warning(f"Could not remove session file {p}: {e}")

    def _create_telethon_client(self, api_id: int = 0, api_hash: str = ""):
        if not telethon_available:
            return None
        target_api_id = api_id if api_id > 0 else settings.TELEGRAM_API_ID
        target_api_hash = api_hash if api_hash else settings.TELEGRAM_API_HASH

        if not target_api_id or not target_api_hash:
            return None

        session_path = str(settings.BASE_DIR / "darknet_session")
        return TelegramClient(session_path, int(target_api_id), str(target_api_hash))

    async def get_connected_client(self) -> Optional[Any]:
        """Get or initialize the persistent connected TelegramClient to prevent SQLite lock errors."""
        if self.client:
            try:
                if self.client.is_connected():
                    return self.client
                await self.client.connect()
                return self.client
            except Exception:
                self.client = None

        self.client = self._create_telethon_client()
        if not self.client:
            return None

        try:
            await self.client.connect()
            return self.client
        except Exception as e:
            err_str = str(e)
            if "auth_key" in err_str.lower() or "nonce" in err_str.lower() or "step 3" in err_str.lower():
                self._cleanup_corrupted_session()
            self.client = None
            return None

    def _safe_name(self, s: str) -> str:
        s = re.sub(r"\W+", "_", (s or "").strip())
        s = s.strip("_")
        return s[:80] if s else "target"

    def _get_latest_saved_msg_id(self, channel_id: str) -> int:
        """Parse all channel CSV files under data/{channel_id}/chats/ and return the maximum raw Telethon message ID stored."""
        try:
            chats_dir = settings.DATA_DIR / channel_id / "chats"
            if not chats_dir.exists():
                return 0
            
            max_id = 0
            for csv_file in chats_dir.glob("messages_*.csv"):
                with open(csv_file, "r", encoding="utf-8") as f:
                    reader = csv.reader(f)
                    rows = list(reader)
                    if len(rows) > 1:
                        for row in rows[1:]:
                            if len(row) > 0:
                                msg_id_str = row[0]
                                parts = msg_id_str.split("_")
                                if len(parts) >= 3:
                                    try:
                                        raw_id = int(parts[-1])
                                        if raw_id > max_id:
                                            max_id = raw_id
                                    except ValueError:
                                        pass
            return max_id
        except Exception as e:
            logger.error(f"Error reading latest saved message ID: {e}")
            return 0

    def _write_messages_to_csv(self, channel_id: str, messages: List[Dict[str, Any]]):
        """Store scraped data in CSV date-wise under data/{channel_id}/chats/ directory."""
        try:
            # Group messages by their posting dates converted to India Standard Time (IST)
            ist = timezone(timedelta(hours=5, minutes=30))
            msgs_by_date = {}
            for msg in messages:
                date_val = msg.get("date", "")
                try:
                    dt_utc = datetime.fromisoformat(date_val.replace("Z", "+00:00"))
                    dt_ist = dt_utc.astimezone(ist)
                    msg_date_str = dt_ist.strftime("%Y-%m-%d")
                except Exception:
                    msg_date_str = datetime.now(ist).strftime("%Y-%m-%d")
                if msg_date_str not in msgs_by_date:
                    msgs_by_date[msg_date_str] = []
                msgs_by_date[msg_date_str].append(msg)

            for date_str, date_msgs in msgs_by_date.items():
                chats_dir = settings.DATA_DIR / channel_id / "chats"
                chats_dir.mkdir(parents=True, exist_ok=True)
                csv_file = chats_dir / f"messages_{date_str}.csv"
                
                existing_ids = set()
                file_exists = csv_file.exists()
                if file_exists:
                    with open(csv_file, "r", newline="", encoding="utf-8") as rf:
                        reader = csv.reader(rf)
                        rows = list(reader)
                        if len(rows) > 0:
                            for row in rows[1:]:  # Skip header row
                                if len(row) > 0:
                                    existing_ids.add(row[0])
                
                # De-duplicate
                new_messages = [m for m in date_msgs if m.get("id") not in existing_ids]
                if not new_messages:
                    continue
                
                # Sort chronologically so they append in ascending order
                new_messages.sort(key=lambda x: x.get("id"))

                with open(csv_file, "a", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    if not file_exists:
                        writer.writerow(["message_id", "date", "sender", "text", "views", "threat_level"])
                    
                    for msg in new_messages:
                        writer.writerow([
                            msg.get("id"),
                            msg.get("date"),
                            msg.get("sender"),
                            msg.get("text", "").replace("\n", " "),
                            msg.get("views", 0),
                            msg.get("threat_level", "LOW")
                        ])
                self.log(f"✓ Appended {len(new_messages)} unique messages to: data/{channel_id}/chats/messages_{date_str}.csv")
        except Exception as e:
            logger.error(f"Error saving messages to CSV: {e}")


    async def check_auth_status(self) -> Dict[str, Any]:
        """Check if Telethon user session is active and authorized."""
        if not telethon_available:
            return {"is_authorized": False, "reason": "Telethon library missing"}

        async with self._lock:
            client = await self.get_connected_client()
            if not client:
                return {"is_authorized": False, "reason": "API ID and API Hash not set in .env"}

            try:
                is_auth = await client.is_user_authorized()
                user_info = None
                if is_auth:
                    me = await client.get_me()
                    user_info = {
                        "id": me.id,
                        "username": me.username,
                        "first_name": me.first_name,
                        "phone": me.phone
                    }
                return {
                    "is_authorized": is_auth,
                    "user": user_info,
                    "api_id": settings.TELEGRAM_API_ID
                }
            except Exception as e:
                return {"is_authorized": False, "reason": str(e)}

    async def send_otp_code(self, phone_number: str, api_id: int = 0, api_hash: str = "") -> Dict[str, Any]:
        """Send Telegram OTP code to phone number, maintaining active Telethon client."""
        clean_phone = phone_number.strip().replace(" ", "")

        async with self._lock:
            if self.client:
                try:
                    await self.client.disconnect()
                except Exception:
                    pass
                self.client = None

            self.auth_client = self._create_telethon_client(api_id, api_hash)
            if not self.auth_client:
                return {"error": "Invalid API ID or API Hash. Please verify your credentials in Settings or .env"}

            try:
                try:
                    await self.auth_client.connect()
                except Exception as conn_err:
                    if "auth_key" in str(conn_err).lower() or "nonce" in str(conn_err).lower():
                        self.log("Detected corrupted session key. Resetting session file...")
                        self._cleanup_corrupted_session()
                        self.auth_client = self._create_telethon_client(api_id, api_hash)
                        await self.auth_client.connect()
                    else:
                        raise conn_err

                if await self.auth_client.is_user_authorized():
                    me = await self.auth_client.get_me()
                    await self.auth_client.disconnect()
                    self.auth_client = None
                    return {
                        "status": "already_authenticated",
                        "user": {"id": me.id, "username": me.username, "phone": me.phone}
                    }

                res = await self.auth_client.send_code_request(clean_phone)
                self.phone_code_hash = res.phone_code_hash
                self.active_phone = clean_phone

                self.log(f"Successfully requested OTP code for {clean_phone}")
                return {
                    "status": "code_sent",
                    "phone_number": clean_phone,
                    "phone_code_hash": res.phone_code_hash
                }
            except ApiIdInvalidError:
                if self.auth_client:
                    await self.auth_client.disconnect()
                    self.auth_client = None
                return {"error": "The API ID / API Hash provided is invalid. Please check your credentials from my.telegram.org."}
            except PhoneNumberInvalidError:
                if self.auth_client:
                    await self.auth_client.disconnect()
                    self.auth_client = None
                return {"error": "Invalid phone number format. Please enter in full international format (e.g., +919876543210)."}
            except Exception as e:
                if self.auth_client:
                    try:
                        await self.auth_client.disconnect()
                    except Exception:
                        pass
                    self.auth_client = None
                err_msg = str(e)
                if "auth_key" in err_msg.lower() or "nonce" in err_msg.lower():
                    self._cleanup_corrupted_session()
                    return {"error": "Session handshake retry requested. Please click 'Send OTP Code' again."}
                self.log(f"Error sending OTP to {clean_phone}: {e}")
                return {"error": err_msg}

    async def verify_otp_code(self, phone_number: str, code: str, phone_code_hash: Optional[str] = None, password: Optional[str] = None) -> Dict[str, Any]:
        """Verify OTP code and complete Telethon sign-in."""
        clean_phone = phone_number.strip().replace(" ", "")
        code_str = code.strip()

        async with self._lock:
            if not self.auth_client:
                self.auth_client = self._create_telethon_client()
                if not self.auth_client:
                    return {"error": "Telethon client unavailable."}
                await self.auth_client.connect()

            hash_to_use = phone_code_hash or self.phone_code_hash

            try:
                try:
                    user = await self.auth_client.sign_in(phone=clean_phone, code=code_str, phone_code_hash=hash_to_use)
                except SessionPasswordNeededError:
                    if not password:
                        return {"error": "2FA_PASSWORD_REQUIRED", "message": "Two-Factor Authentication (2FA) password required"}
                    user = await self.auth_client.sign_in(password=password)

                me = await self.auth_client.get_me()
                await self.auth_client.disconnect()
                self.auth_client = None

                self.log(f"🎉 Successfully authenticated Telegram session for @{me.username or me.id}!")
                
                # Auto-sync dialogs
                asyncio.create_task(self.sync_user_dialogs())

                return {
                    "status": "authenticated",
                    "user": {
                        "id": me.id,
                        "username": me.username,
                        "first_name": me.first_name,
                        "phone": me.phone
                    }
                }
            except Exception as e:
                self.log(f"Error verifying OTP code: {e}")
                return {"error": str(e)}

    async def sync_user_dialogs(self) -> List[Dict[str, Any]]:
        """Fetch ALL real Telegram channels & groups from the authenticated user's account."""
        self.log("Syncing real channels and groups from your Telegram account...")
        
        async with self._lock:
            client = await self.get_connected_client()
            if not client:
                self.log("Cannot sync channels: Telethon client configuration missing.")
                return []

            imported_channels = []
            try:
                if not await client.is_user_authorized():
                    self.log("User not authorized yet. Please complete OTP login first.")
                    return []

                real_count = 0
                async for dialog in client.iter_dialogs(limit=500):
                    entity = dialog.entity
                    
                    if isinstance(entity, TelethonUser) and not getattr(entity, 'bot', False):
                        continue

                    raw_username = getattr(entity, 'username', '') or ""
                    username_display = f"@{raw_username}" if raw_username else "Private Group/Channel"
                    title = dialog.name or getattr(entity, 'title', None) or f"Telegram_{dialog.id}"
                    
                    if getattr(entity, 'megagroup', False):
                        ch_type = "Supergroup"
                    elif getattr(dialog, 'is_channel', False) or isinstance(entity, TelethonChannel):
                        ch_type = "Channel"
                    else:
                        ch_type = "Group"

                    member_count = getattr(entity, 'participants_count', 0) or getattr(entity, 'members_count', 0) or 0
                    ch_id = str(dialog.id)
                    existing_msgs = [m for m in store.messages.values() if m.get("channel_id") == ch_id]

                    ch_data = {
                        "id": ch_id,
                        "username": username_display,
                        "raw_username": raw_username,
                        "title": title,
                        "description": f"Real Telegram {ch_type} ({title})",
                        "member_count": member_count,
                        "is_monitored": True,
                        "last_scraped_at": None,
                        "category": ch_type,
                        "type": ch_type,
                        "message_count": len(existing_msgs),
                        "status": "idle",
                        "is_auto_monitoring": False,
                        "monitoring_interval_value": 60,
                        "monitoring_interval_unit": "minutes",
                        "next_scrape_at": None,
                        "is_auto_ai": False,
                        "ai_interval_value": 60,
                        "ai_interval_unit": "minutes",
                        "next_ai_at": None,
                        "is_auto_report": False,
                        "report_interval_value": 24,
                        "report_interval_unit": "hours",
                        "next_report_at": None
                    }

                    store.channels[ch_id] = ch_data
                    imported_channels.append(ch_data)
                    real_count += 1

                self.log(f"✓ Successfully imported {real_count} REAL channels/groups from your Telegram account!")
                return imported_channels
            except Exception as e:
                self.log(f"Error syncing Telegram dialogs: {e}")
                return []

    async def scrape_channels(self, channels: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fetch REAL Telegram messages. Full scrape on first run; incremental updates thereafter."""
        self.is_scraping = True
        self.progress = 0
        self.logs.clear()
        self.total_channels_count = len(channels)
        self.scrape_queue = [ch.get("title", ch.get("id", "?")) for ch in channels]
        self.completed_channels = []
        self.log(f"Initiating Telegram data collection across {len(channels)} channels...")

        all_scraped_messages = []
        try:
            async with self._lock:
                client = await self.get_connected_client()
                total_channels = len(channels)

                is_user_auth = False
                if client:
                    try:
                        is_user_auth = await client.is_user_authorized()
                    except Exception as e:
                        self.log(f"Verification of user authorization failed: {e}")

                for idx, channel in enumerate(channels):
                    ch_id = channel.get("id")
                    raw_user = channel.get("raw_username", "")
                    target_entity = raw_user if raw_user else int(ch_id) if str(ch_id).lstrip("-").isdigit() else ch_id

                    self.current_channel = channel.get("title", str(target_entity))
                    # Remove from queue as we start scraping it
                    if self.current_channel in self.scrape_queue:
                        self.scrape_queue.remove(self.current_channel)
                    store.channels[ch_id]["status"] = "scraping"

                    # Check for incremental scraping stage
                    latest_raw_id = self._get_latest_saved_msg_id(ch_id)
                    
                    if latest_raw_id > 0:
                        self.log(f"🔄 Incremental scrape active for '{self.current_channel}'. Only fetching posts newer than message ID {latest_raw_id}...")
                    else:
                        self.log(f"🚀 First-time scrape active for '{self.current_channel}'. Crawling full conversational history...")

                    scraped_from_channel = []

                    if client and is_user_auth:
                        try:
                            try:
                                entity = await client.get_entity(target_entity)
                            except Exception:
                                entity = target_entity

                            # If latest_raw_id exists, fetch only newer posts using min_id
                            # If first run, scrape full history (capped at 50,000 to prevent flood blocks)
                            limit_val = 1500 if latest_raw_id > 0 else 50000

                            kwargs = {"limit": limit_val}
                            if latest_raw_id > 0:
                                kwargs["min_id"] = latest_raw_id

                            async for message in client.iter_messages(entity, **kwargs):
                                if not message.text:
                                    continue

                                
                                # Resolve sender username AND ID together
                                sender_desc = None
                                sender_id_str = str(message.sender_id or "unknown")
                                try:
                                    sender_obj = await message.get_sender()
                                    if sender_obj:
                                        username_val = getattr(sender_obj, 'username', None)
                                        if username_val:
                                            sender_desc = f"@{username_val} ({sender_id_str})"
                                        else:
                                            fn = getattr(sender_obj, 'first_name', None) or ""
                                            ln = getattr(sender_obj, 'last_name', None) or ""
                                            disp = f"{fn} {ln}".strip()
                                            if disp:
                                                sender_desc = f"{disp} ({sender_id_str})"
                                except Exception:
                                    pass
                                
                                if not sender_desc:
                                    sender_desc = sender_id_str

                                msg_date = message.date
                                msg_data = {
                                    "id": f"msg_{ch_id}_{message.id}",
                                    "channel_id": str(ch_id),
                                    "channel_username": channel.get("title") or channel.get("username"),
                                    "sender": sender_desc,
                                    "text": message.text,
                                    "date": msg_date.isoformat() if msg_date else datetime.utcnow().isoformat(),
                                    "views": getattr(message, "views", 10) or 10,
                                    "media_url": None,
                                    "threat_level": "LOW",
                                    "analyzed": False
                                }
                                scraped_from_channel.append(msg_data)

                            self.log(f"✓ Extracted {len(scraped_from_channel)} new posts from '{self.current_channel}'")
                            
                            # Store channel-wise CSV in backend (de-duplicated)
                            if scraped_from_channel:
                                self._write_messages_to_csv(ch_id, scraped_from_channel)
                                store.add_notification("scrape", f"✓ Scraped {len(scraped_from_channel)} new messages from '{self.current_channel}'")


                        except Exception as e:
                            self.log(f"Telethon live fetch for '{self.current_channel}' error: {e}")
                    else:
                        self.log(f"User account not authorized. Complete Telegram OTP verification in Settings to pull live data.")

                    store.channels[ch_id]["status"] = "idle"
                    store.channels[ch_id]["message_count"] = len([m for m in store.messages.values() if m.get("channel_id") == str(ch_id)]) + len(scraped_from_channel)

                    all_scraped_messages.extend(scraped_from_channel)
                    self.progress = int(((idx + 1) / total_channels) * 100)
                    # Mark channel as completed
                    if self.current_channel not in self.completed_channels:
                        self.completed_channels.append(self.current_channel)
        finally:
            # Guarantee cleanup of status flags
            for ch in store.channels.values():
                ch["status"] = "idle"
            self.progress = 100
            self.is_scraping = False

        self.log(f"Telegram Scraping completed! Total {len(all_scraped_messages)} new messages collected.")
        return all_scraped_messages

telegram_scraper = TelegramScraper()
