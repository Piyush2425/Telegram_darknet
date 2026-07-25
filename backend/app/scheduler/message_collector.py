"""Telegram message parsing helpers for scheduled collection.

Purpose:
    Convert Telethon Message objects into MongoDB-ready threat intelligence
    records without enumerating Telegram members.
Responsibilities:
    Extract sender, message, media, reply, forward, and text indicator metadata.
Dependencies:
    Telethon message objects and Python standard library parsing utilities.
"""

from __future__ import annotations

import base64
import re
from datetime import datetime
from typing import Any, Mapping

from bson import json_util

URL_PATTERN = re.compile(r"https?://[^\s<>()\"']+", re.IGNORECASE)
MENTION_PATTERN = re.compile(r"(?<!\w)@[\w\d_]{3,32}")
HASHTAG_PATTERN = re.compile(r"(?<!\w)#[\w\d_]+")


def _display_name(sender: Any) -> str | None:
    """Return the best human-readable name for a Telegram sender."""
    if sender is None:
        return None
    title = getattr(sender, "title", None)
    if title:
        return str(title)
    parts = [
        getattr(sender, "first_name", None),
        getattr(sender, "last_name", None),
    ]
    name = " ".join(str(part) for part in parts if part)
    return name or None


def _json_safe(value: Any) -> Any:
    """Convert Telethon's nested objects into values MongoDB can store."""
    def _sanitize(item: Any) -> Any:
        if isinstance(item, bytes):
            return {"__bytes__": base64.b64encode(item).decode("ascii")}
        if isinstance(item, dict):
            return {key: _sanitize(val) for key, val in item.items()}
        if isinstance(item, list):
            return [_sanitize(val) for val in item]
        if isinstance(item, tuple):
            return [_sanitize(val) for val in item]
        return item

    return _sanitize(json_util.loads(json_util.dumps(value, default=str)))


def _media_metadata(message: Any) -> dict[str, Any] | None:
    """Return media metadata while leaving media download support pluggable."""
    media = getattr(message, "media", None)
    if media is None:
        return None

    document = getattr(message, "document", None)
    photo = getattr(message, "photo", None)
    metadata: dict[str, Any] = {
        "downloaded": False,
        "media_id": getattr(document or photo, "id", None),
    }
    if document is not None:
        metadata.update(
            {
                "mime_type": getattr(document, "mime_type", None),
                "size": getattr(document, "size", None),
            }
        )
    return {key: value for key, value in metadata.items() if value is not None}


def _media_type(message: Any) -> str | None:
    """Return a stable media type label for a Telegram message."""
    if getattr(message, "photo", None) is not None:
        return "photo"
    if getattr(message, "video", None) is not None:
        return "video"
    if getattr(message, "audio", None) is not None:
        return "audio"
    if getattr(message, "voice", None) is not None:
        return "voice"
    if getattr(message, "document", None) is not None:
        return "document"
    if getattr(message, "sticker", None) is not None:
        return "sticker"
    media = getattr(message, "media", None)
    return media.__class__.__name__ if media is not None else None


def _reply_info(message: Any) -> dict[str, Any] | None:
    """Extract reply metadata from a Telegram message."""
    reply_to = getattr(message, "reply_to", None)
    if reply_to is None:
        return None
    data = {
        "message_id": getattr(reply_to, "reply_to_msg_id", None),
        "top_message_id": getattr(reply_to, "reply_to_top_id", None),
        "forum_topic": getattr(reply_to, "forum_topic", None),
    }
    return {key: value for key, value in data.items() if value is not None}


def _forward_info(message: Any) -> dict[str, Any] | None:
    """Extract forward metadata from a Telegram message."""
    forward = getattr(message, "forward", None) or getattr(message, "fwd_from", None)
    if forward is None:
        return None
    data = {
        "sender_id": getattr(forward, "sender_id", None),
        "chat_id": getattr(forward, "chat_id", None),
        "channel_post": getattr(forward, "channel_post", None),
        "from_name": getattr(forward, "from_name", None),
        "date": getattr(forward, "date", None),
    }
    return {key: value for key, value in data.items() if value is not None}


def _extract_indicators(text: str) -> tuple[list[str], list[str], list[str]]:
    """Return hashtags, mentions, and URLs found in message text."""
    hashtags = sorted(set(HASHTAG_PATTERN.findall(text)))
    mentions = sorted(set(MENTION_PATTERN.findall(text)))
    urls = sorted(set(URL_PATTERN.findall(text)))
    return hashtags, mentions, urls


async def parse_telegram_message(
    message: Any,
    entity: Mapping[str, Any],
    chat_id: int,
) -> dict[str, Any]:
    """Build a MongoDB-ready document from a Telethon message.

    Args:
        message: Telethon message yielded by ``client.iter_messages``.
        entity: Persisted Explorer entity for the Telegram chat.
        chat_id: Numeric Telegram chat ID used by Darknet Monitor.

    Returns:
        A normalized Telegram threat intelligence message document.
    """
    sender = getattr(message, "sender", None)
    if sender is None and hasattr(message, "get_sender"):
        try:
            sender = await message.get_sender()
        except Exception:
            sender = None

    text = getattr(message, "text", None) or getattr(message, "message", None) or ""
    hashtags, mentions, urls = _extract_indicators(text)
    raw_message = message.to_dict() if hasattr(message, "to_dict") else {}
    message_date = getattr(message, "date", None)
    if isinstance(message_date, datetime) and message_date.tzinfo is None:
        message_date = message_date.replace(tzinfo=None)

    sender_id = getattr(message, "sender_id", None)
    sender_name = _display_name(sender)
    return {
        "message_id": int(message.id),
        "chat_id": chat_id,
        "chat_name": entity.get("title") or entity.get("username"),
        "sender": sender_id,
        "sender_id": sender_id,
        "sender_username": getattr(sender, "username", None),
        "sender_name": sender_name,
        "text": text,
        "message_text": text,
        "raw_message": _json_safe(raw_message),
        "date": message_date,
        "message_date": message_date,
        "media_type": _media_type(message),
        "media": _media_metadata(message),
        "reply_to": _json_safe(_reply_info(message)),
        "forward_from": _json_safe(_forward_info(message)),
        "hashtags": hashtags,
        "mentions": mentions,
        "urls": urls,
    }
