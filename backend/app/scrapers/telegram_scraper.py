import os
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from ..config import settings

logger = logging.getLogger("darknet_monitor.scraper")

# Try Telethon import
telethon_available = False
try:
    from telethon import TelegramClient
    from telethon.errors import SessionPasswordNeededError, RPCError, ApiIdInvalidError, PhoneNumberInvalidError
    telethon_available = True
except ImportError:
    telethon_available = False

MOCK_MESSAGES_POOL = [
    {
        "text": "EXCLUSIVITY LEAK: Fresh database dump from major regional logistics provider. 450,000 user records, hashed passwords, SSNs and full address logs. Download link: http://breachlogs.onion/download?id=84920. BTC wallet for VIP access: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa. Contact @admin_darknet for pricing.",
        "threat_level": "CRITICAL",
        "views": 1420
    },
    {
        "text": "CRITICAL ZERO-DAY DISCLOSURE: CVE-2026-11849 affecting Linux kernel eBPF subsystem allowing unprivileged local privilege escalation (LPE) to root. Exploit script POC available on git. IOC hashes: sha256 5f4dcc3b5aa765d61d8327deb882cf992b95990a1ce22255470d061718040a1b.",
        "threat_level": "HIGH",
        "views": 3290
    },
    {
        "text": "Lumma Stealer v4.2 updated with bypass for Chrome 127 Application-Bound Encryption. Features cookie stealing, Telegram session hijacker, and MetaMask wallet grabber. C2 server: 194.165.16.82:8080. Contact LummaDev on Tox.",
        "threat_level": "CRITICAL",
        "views": 5120
    }
]

class TelegramScraper:
    """Telegram Scraper with Telethon OTP Login matching cli.py persistent authentication."""

    def __init__(self):
        self.is_scraping = False
        self.progress = 0
        self.current_channel = ""
        self.logs: List[str] = []
        self.auth_client: Optional[Any] = None
        self.phone_code_hash: Optional[str] = None
        self.active_phone: Optional[str] = None

    def log(self, message: str):
        timestamp = datetime.utcnow().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self.logs.append(log_entry)
        if len(self.logs) > 100:
            self.logs.pop(0)
        logger.info(log_entry)

    def _create_telethon_client(self, api_id: int = 0, api_hash: str = ""):
        if not telethon_available:
            return None
        target_api_id = api_id if api_id > 0 else settings.TELEGRAM_API_ID
        target_api_hash = api_hash if api_hash else settings.TELEGRAM_API_HASH

        if not target_api_id or not target_api_hash:
            return None

        session_path = str(settings.BASE_DIR / "darknet_session")
        return TelegramClient(session_path, int(target_api_id), str(target_api_hash))

    async def check_auth_status(self) -> Dict[str, Any]:
        """Check if Telethon user session is active and authorized."""
        if not telethon_available:
            return {"is_authorized": False, "reason": "Telethon library missing"}

        client = self._create_telethon_client()
        if not client:
            return {"is_authorized": False, "reason": "API ID and API Hash not set in .env"}

        try:
            await client.connect()
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
            await client.disconnect()
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
        
        # Initialize persistent auth client
        self.auth_client = self._create_telethon_client(api_id, api_hash)
        if not self.auth_client:
            return {"error": "Invalid API ID or API Hash. Please verify your credentials in Settings or .env"}

        try:
            await self.auth_client.connect()
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
            self.log(f"Error sending OTP to {clean_phone}: {e}")
            return {"error": str(e)}

    async def verify_otp_code(self, phone_number: str, code: str, phone_code_hash: Optional[str] = None, password: Optional[str] = None) -> Dict[str, Any]:
        """Verify OTP code and complete Telethon sign-in."""
        clean_phone = phone_number.strip().replace(" ", "")
        code_str = code.strip()

        # Use existing connected auth_client or reconnect
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

    async def scrape_channels(self, channels: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fetch real Telegram messages via Telethon or fallback to demo telemetry."""
        self.is_scraping = True
        self.progress = 0
        self.logs.clear()
        self.log(f"Initiating Telegram data collection across {len(channels)} channels...")

        client = self._create_telethon_client()
        all_scraped_messages = []
        total_channels = len(channels)

        if client:
            try:
                await client.connect()
            except Exception as e:
                self.log(f"Telethon client connection failed: {e}")
                client = None

        for idx, channel in enumerate(channels):
            username = channel.get("username", "").replace("@", "").strip()
            self.current_channel = username
            self.log(f"Connecting to Telegram API... Fetching live posts from @{username}")

            scraped_from_channel = []

            if client and await client.is_user_authorized():
                try:
                    # Fetch REAL live messages using Telethon
                    entity = await client.get_entity(username)
                    async for message in client.iter_messages(entity, limit=30):
                        if not message.text:
                            continue
                        
                        msg_date = message.date if message.date else datetime.utcnow()
                        msg_data = {
                            "id": f"msg_{channel['id']}_{message.id}",
                            "channel_id": channel["id"],
                            "channel_username": username,
                            "sender": str(message.sender_id or f"User_{username}"),
                            "text": message.text,
                            "date": msg_date.isoformat(),
                            "views": getattr(message, "views", 100) or 100,
                            "media_url": None,
                            "threat_level": "LOW",
                            "analyzed": False
                        }
                        scraped_from_channel.append(msg_data)

                    self.log(f"✓ REAL Telegram API: Scraped {len(scraped_from_channel)} live posts from @{username}")
                except Exception as e:
                    self.log(f"Real Telethon fetch for @{username} encountered error: {e}. Generating demo telemetry.")
                    scraped_from_channel = self._generate_mock_messages(channel)
            else:
                # Demo telemetry fallback
                await asyncio.sleep(0.8)
                scraped_from_channel = self._generate_mock_messages(channel)
                self.log(f"Demo Mode: Generated {len(scraped_from_channel)} telemetry posts for @{username}")

            all_scraped_messages.extend(scraped_from_channel)
            self.progress = int(((idx + 1) / total_channels) * 100)

        if client:
            try:
                await client.disconnect()
            except Exception:
                pass

        self.log(f"Scraping completed! Total {len(all_scraped_messages)} messages collected.")
        self.is_scraping = False
        return all_scraped_messages

    def _generate_mock_messages(self, channel: Dict[str, Any]) -> List[Dict[str, Any]]:
        import random
        num_messages = random.randint(3, 5)
        msgs = []
        for m_idx in range(num_messages):
            sample = random.choice(MOCK_MESSAGES_POOL)
            msg_time = datetime.utcnow() - timedelta(minutes=random.randint(5, 120))
            msgs.append({
                "id": f"msg_{channel['id']}_{m_idx}_{int(msg_time.timestamp())}",
                "channel_id": channel["id"],
                "channel_username": channel.get("username", "Unknown"),
                "sender": f"User_{random.randint(1000, 9999)}",
                "text": sample["text"],
                "date": msg_time.isoformat(),
                "views": sample["views"] + random.randint(10, 500),
                "media_url": None,
                "threat_level": sample["threat_level"],
                "analyzed": False
            })
        return msgs

telegram_scraper = TelegramScraper()
