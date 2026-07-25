#!/usr/bin/env python3
import os
from pathlib import Path
from telethon.sync import TelegramClient

# Load env variables from .env
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    with env_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip().strip('"').strip("'")

api_id = os.getenv("TELEGRAM_API_ID")
api_hash = os.getenv("TELEGRAM_API_HASH")
phone = os.getenv("TELEGRAM_PHONE")

if not api_id or not api_hash or not phone:
    print("Error: Please make sure TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_PHONE are set in backend/.env")
    exit(1)

config_dir = Path(os.getenv("DARKNET_MONITOR_CONFIG_DIR", "~/.darknet_monitor")).expanduser()
session_path = Path(os.getenv("TELEGRAM_SESSION_PATH", str(config_dir / "darknet_monitor"))).expanduser()

print(f"Initializing Telegram Client with:")
print(f"API ID: {api_id}")
print(f"Phone: {phone}")
print(f"Session path: {session_path}.session")

client = TelegramClient(str(session_path), int(api_id), api_hash)

async def main():
    await client.start(phone=phone)
    print("\nSUCCESS: Session authorized successfully!")
    me = await client.get_me()
    print(f"Logged in as: {me.first_name} {me.last_name or ''} (@{me.username or 'No Username'})")

with client:
    client.loop.run_until_complete(main())
