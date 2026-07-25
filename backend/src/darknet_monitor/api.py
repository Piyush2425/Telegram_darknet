from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import asyncio
import json
import os
import threading
import sys
from functools import lru_cache
from pathlib import Path
from datetime import datetime, time, timezone, timedelta

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.explorer.entity_repository import EntityRepositoryError
from app.explorer.entity_service import (
    InvalidSessionError,
    TelegramConnectionError,
    TelegramExplorerError,
    TelegramRateLimitError,
)
from app.explorer.telegram_explorer import (
    ExplorerConfigurationError,
    TelegramExplorer,
)
from app.agent import AnalysisReportAgent
from app.scheduler import (
    SchedulerConfig,
    ScrapeRepositoryError,
    TelegramGroupScheduler,
    TelegramGroupScrapeRepository,
)
from pymongo import MongoClient

if __package__ in (None, ""):
    import sys
    from pathlib import Path

    sys.path.append(str(Path(__file__).resolve().parents[1]))
    from darknet_monitor.app import monitor
else:
    from .app import monitor

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
explorer_refresh_lock = threading.Lock()
scheduler_lock = threading.Lock()
IST = timezone(timedelta(hours=5, minutes=30))
CONTROL_DIR = Path(os.getenv("DARKNET_MONITOR_CONFIG_DIR", "~/.darknet_monitor")).expanduser()
SETTINGS_PATH = CONTROL_DIR / "settings.json"
EVENT_LOG_PATH = CONTROL_DIR / "activity.jsonl"
DEFAULT_SETTINGS = {
    "dashboard_refresh_seconds": 30,
    "queue_refresh_seconds": 5,
    "messages_page_size": 50,
    "logs_page_size": 100,
    "theme": "dark",
    "scheduler_run_at": "02:00",
    "scheduler_interval_hours": 24,
    "default_message_sort_by": "message_date",
    "default_message_sort_order": "desc",
}
MONITORING_STATE = {
    "status": "running",
    "updated_at": None,
}

def run_async(coro):
    """Run an async coroutine in a new event loop in a separate thread"""
    loop = asyncio.new_event_loop()
    return loop.run_until_complete(coro)


@lru_cache(maxsize=1)
def get_explorer():
    """Return the process-wide Telegram Explorer dependency graph."""
    return TelegramExplorer.from_environment()


@lru_cache(maxsize=1)
def get_scrape_repository():
    """Return the process-wide Telegram message storage repository."""
    csv_root = Path(os.getenv("TELEGRAM_SCRAPE_CSV_ROOT", "data/csv")).expanduser()
    if not csv_root.is_absolute():
        csv_root = (BACKEND_ROOT.parent / csv_root).resolve()
    repository = TelegramGroupScrapeRepository(
        mongo_uri=os.getenv("MONGODB_URI", "mongodb://localhost:27017"),
        database_name=os.getenv("MONGODB_DATABASE", "darknet_monitor"),
        csv_root=csv_root,
    )
    repository.ensure_storage_directories()
    return repository


@lru_cache(maxsize=1)
def get_report_agent():
    """Return the process-wide analysis report agent."""
    report_root = BACKEND_ROOT.parent / "Reports"
    return AnalysisReportAgent(
        scrape_repository=get_scrape_repository(),
        report_root=report_root,
    )


@lru_cache(maxsize=1)
def get_scheduler():
    """Return the process-wide Telegram group scheduler."""
    explorer = get_explorer()
    config_dir = Path(os.getenv("DARKNET_MONITOR_CONFIG_DIR", "~/.darknet_monitor")).expanduser()
    settings = load_settings()
    schedule_time = str(settings.get("scheduler_run_at", os.getenv("TELEGRAM_SCHEDULER_TIME", "02:00"))).strip()
    interval_hours = int(settings.get("scheduler_interval_hours", 24))
    hour, minute = [int(part) for part in schedule_time.split(":", 1)]
    # Wire record_event as the on_event callback so scraping events go to the Logs page
    def _scheduler_event_callback(level: str, message: str, **details) -> None:
        record_event(level, message, **details)

    scheduler = TelegramGroupScheduler(
        explorer=explorer,
        scrape_repository=get_scrape_repository(),
        session_path=Path(os.getenv("TELEGRAM_SESSION_PATH", str(config_dir / "darknet_monitor"))).expanduser(),
        api_id=int(os.getenv("TELEGRAM_API_ID", "0")),
        api_hash=os.getenv("TELEGRAM_API_HASH", "").strip(),
        on_event=_scheduler_event_callback,
        report_agent=get_report_agent(),
    )
    scheduler.configure(SchedulerConfig(run_at=time(hour=hour, minute=minute), interval_hours=interval_hours))
    return scheduler


def _serialize_datetime(value):
    """Convert datetime-like values to API-safe strings."""
    return value.isoformat() if hasattr(value, "isoformat") else value


def serialize_entity(entity, metrics=None):
    """Convert a persisted entity into the public Explorer API representation."""
    metrics = metrics or {}
    return {
        "telegram_id": entity.get("telegram_id"),
        "title": entity.get("title"),
        "username": entity.get("username"),
        "type": entity.get("type"),
        "is_private": entity.get("is_private"),
        "participants_count": entity.get("participants_count"),
        "enabled": bool(entity.get("enabled", False)),
        "messages_stored": metrics.get("messages_stored", 0),
        "new_messages": metrics.get("new_messages", 0),
        "last_message_id": metrics.get("last_message_id"),
        "last_scraped": _serialize_datetime(metrics.get("last_scraped")),
        "last_scrape": _serialize_datetime(metrics.get("last_scraped")),
        "last_analysis_at": _serialize_datetime(metrics.get("last_analysis_at")),
        "last_analysis_message_id": metrics.get("last_analysis_message_id"),
        "next_scrape_at": _serialize_datetime(metrics.get("next_scrape_at")),
        "interval_minutes": int(entity.get("interval_minutes") or metrics.get("interval_minutes") or 60),
        "monitoring_status": str(metrics.get("monitoring_status") or entity.get("monitoring_status") or ("Monitoring" if entity.get("enabled") else "Idle")),
        "last_error": metrics.get("last_error") or entity.get("last_error"),
        "last_synced": _serialize_datetime(entity.get("last_synced")),
        "memory_path": entity.get("memory_path") or metrics.get("memory_path"),
        "daily_report_path": entity.get("daily_report_path") or metrics.get("daily_report_path"),
        "daily_pdf_path": entity.get("daily_pdf_path") or metrics.get("daily_pdf_path"),
    }


def mongo_status():
    """Return a compact MongoDB connectivity status."""
    client = MongoClient(os.getenv("MONGODB_URI", "mongodb://localhost:27017"), serverSelectionTimeoutMS=1500)
    try:
        client.admin.command("ping")
        return "Connected"
    finally:
        client.close()


def explorer_error_response(error):
    """Map Explorer domain failures to clear JSON errors and HTTP statuses."""
    if isinstance(error, InvalidSessionError):
        return jsonify({"success": False, "error": str(error)}), 401
    if isinstance(error, TelegramRateLimitError):
        return (
            jsonify(
                {
                    "success": False,
                    "error": str(error),
                    "retry_after": error.seconds,
                }
            ),
            429,
        )
    if isinstance(error, TelegramConnectionError):
        return jsonify({"success": False, "error": str(error)}), 503
    if isinstance(error, ExplorerConfigurationError):
        return jsonify({"success": False, "error": str(error)}), 503
    return jsonify({"success": False, "error": str(error)}), 500


def _ensure_control_dir():
    CONTROL_DIR.mkdir(parents=True, exist_ok=True)


def record_event(level: str, message: str, **details):
    """Persist a small operational audit event for the logs endpoint."""
    try:
        _ensure_control_dir()
        payload = {
            "id": f"{int(datetime.now(timezone.utc).timestamp() * 1000)}-{threading.get_ident()}",
            "level": level.lower(),
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": details or {},
        }
        with EVENT_LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")
    except Exception:
        pass


def load_settings():
    """Load frontend-visible control panel settings."""
    _ensure_control_dir()
    if not SETTINGS_PATH.exists():
        return dict(DEFAULT_SETTINGS)
    try:
        data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return dict(DEFAULT_SETTINGS)
    settings = dict(DEFAULT_SETTINGS)
    if isinstance(data, dict):
        settings.update({key: value for key, value in data.items() if key in DEFAULT_SETTINGS})
    return settings


def save_settings(payload):
    """Validate and persist frontend-visible settings."""
    settings = load_settings()
    updated = dict(settings)

    def _coerce_int(name, minimum, maximum):
        value = payload.get(name, updated[name])
        try:
            value = int(value)
        except (TypeError, ValueError):
            raise ValueError(f"{name} must be an integer")
        if not minimum <= value <= maximum:
            raise ValueError(f"{name} must be between {minimum} and {maximum}")
        updated[name] = value

    _coerce_int("dashboard_refresh_seconds", 5, 600)
    _coerce_int("queue_refresh_seconds", 1, 120)
    _coerce_int("messages_page_size", 10, 200)
    _coerce_int("logs_page_size", 10, 500)
    _coerce_int("scheduler_interval_hours", 1, 168)

    run_at = str(payload.get("scheduler_run_at", updated["scheduler_run_at"])).strip()
    if len(run_at) != 5 or run_at[2] != ":":
        raise ValueError("scheduler_run_at must be in HH:MM format")
    hour, minute = run_at.split(":", 1)
    if not (hour.isdigit() and minute.isdigit()):
        raise ValueError("scheduler_run_at must be in HH:MM format")
    hour_i = int(hour)
    minute_i = int(minute)
    if hour_i > 23 or minute_i > 59:
        raise ValueError("scheduler_run_at must be a valid time")
    updated["scheduler_run_at"] = f"{hour_i:02d}:{minute_i:02d}"

    theme = str(payload.get("theme", updated["theme"])).strip().lower()
    if theme not in {"dark", "light"}:
        raise ValueError("theme must be dark or light")
    updated["theme"] = theme

    sort_by = str(payload.get("default_message_sort_by", updated["default_message_sort_by"])).strip()
    if sort_by not in {"message_date", "created_at", "sender_name", "chat_name", "message_id"}:
        raise ValueError("default_message_sort_by is invalid")
    updated["default_message_sort_by"] = sort_by

    sort_order = str(payload.get("default_message_sort_order", updated["default_message_sort_order"])).strip().lower()
    if sort_order not in {"asc", "desc"}:
        raise ValueError("default_message_sort_order must be asc or desc")
    updated["default_message_sort_order"] = sort_order

    _ensure_control_dir()
    SETTINGS_PATH.write_text(json.dumps(updated, indent=2), encoding="utf-8")
    return updated


def load_events(search: str = "", level: str = "", limit: int = 100, offset: int = 0):
    """Load audit events from the local activity log."""
    _ensure_control_dir()
    if not EVENT_LOG_PATH.exists():
        return []
    entries = []
    try:
        with EVENT_LOG_PATH.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    entries.append(json.loads(line))
                except Exception:
                    continue
    except Exception:
        return []
    search_lower = search.strip().lower()
    level_lower = level.strip().lower()
    filtered = [
        item
        for item in entries
        if (not level_lower or str(item.get("level", "")).lower() == level_lower)
        and (
            not search_lower
            or search_lower in str(item.get("message", "")).lower()
            or search_lower in json.dumps(item.get("details", {}), ensure_ascii=False, default=str).lower()
        )
    ]
    limit = max(min(int(limit), 500), 1)
    offset = max(int(offset), 0)
    return list(reversed(filtered))[offset : offset + limit]


def _scan_report_files():
    """Return metadata for generated Markdown and PDF reports."""
    report_root = BACKEND_ROOT.parent / "Reports"
    if not report_root.exists():
        return []
    files = sorted(
        [*report_root.rglob("*.md"), *report_root.rglob("*.pdf")],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    records = []
    for path in files[:200]:
        stat = path.stat()
        relative_path = path.relative_to(report_root)
        relative = str(relative_path)
        parts = relative_path.parts
        group = parts[1] if len(parts) > 1 else None
        records.append(
            {
                "path": relative,
                "group": group,
                "kind": "pdf" if path.suffix.lower() == ".pdf" else "markdown",
                "scope": parts[0] if parts else None,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "size": stat.st_size,
            }
        )
    return records


def _read_report_file(report_path: str):
    """Read a report file from the root Reports directory safely."""
    report_root = (BACKEND_ROOT.parent / "Reports").resolve()
    target = (report_root / report_path).resolve()
    if report_root not in target.parents and target != report_root:
        raise ValueError("Invalid report path")
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(report_path)
    return {
        "path": str(target.relative_to(report_root)),
        "modified_at": datetime.fromtimestamp(target.stat().st_mtime, tz=timezone.utc).isoformat(),
        "size": target.stat().st_size,
        "content": target.read_text(encoding="utf-8"),
    }


def _resolve_report_target(report_path: str) -> Path:
    report_root = (BACKEND_ROOT.parent / "Reports").resolve()
    target = (report_root / report_path).resolve()
    if report_root not in target.parents and target != report_root:
        raise ValueError("Invalid report path")
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(report_path)
    return target


def _group_report_state(telegram_id: int) -> dict[str, Any]:
    state = get_report_agent().latest_reports() or {}
    key = str(int(telegram_id))
    for section in ("groups", "channels"):
        section_state = state.get(section, {})
        if isinstance(section_state, dict) and key in section_state:
            value = section_state.get(key)
            if isinstance(value, dict):
                return value
    return {}

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "Darknet Monitor API"})


@app.route('/api/dashboard', methods=['GET'])
def dashboard_status():
    """Return operational and storage metrics for the dashboard."""
    try:
        entities = get_explorer().repository.list_entities()
        storage_stats = get_scrape_repository().get_dashboard_stats()
        scheduler = get_scheduler().status()
        total_channels = sum(1 for entity in entities if str(entity.get("type")).lower() == "channel")
        total_groups = len(entities) - total_channels
        return jsonify(
            {
                "success": True,
                "telegram_status": "Connected" if bool(monitor.client and monitor.client.is_connected()) else "Disconnected",
                "mongodb_status": mongo_status(),
                "scheduler_status": "Running" if scheduler.get("running") or scheduler.get("active") else "Stopped",
                "messages_collected_today": storage_stats["messages_collected_today"],
                "total_messages": storage_stats["total_messages"],
                "total_channels": total_channels,
                "total_groups": total_groups,
            }
        )
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

@app.route('/api/credentials', methods=['POST'])
def save_credentials():
    data = request.json
    api_id = data.get('api_id')
    api_hash = data.get('api_hash')
    phone = data.get('phone')
    
    if not all([api_id, api_hash, phone]):
        return jsonify({"success": False, "error": "Missing required fields"}), 400
    
    success = monitor.save_credentials(api_id, api_hash, phone)
    if success:
        record_event("info", "Credentials saved")
        return jsonify({"success": True, "message": "Credentials saved successfully"})
    else:
        return jsonify({"success": False, "error": "Failed to save credentials"}), 500

@app.route('/api/credentials', methods=['GET'])
def get_credentials_status():
    loaded = monitor.credentials_loaded or monitor.load_credentials()
    return jsonify({"loaded": loaded})


@app.route('/api/status', methods=['GET'])
def get_status():
    loaded = monitor.credentials_loaded or monitor.load_credentials()
    connected = bool(monitor.client and monitor.client.is_connected())
    channels = run_async(monitor.get_channels())
    payload = {
        "credentials_loaded": loaded,
        "client_connected": connected,
        "channels_count": len(channels),
    }
    try:
        storage_stats = get_scrape_repository().get_dashboard_stats()
        payload.update(storage_stats)
        payload["mongodb_status"] = mongo_status()
    except Exception:
        payload["mongodb_status"] = "Unavailable"
    return jsonify(payload)

@app.route('/api/initialize', methods=['POST'])
def initialize_client():
    def init_client():
        return run_async(monitor.initialize_client())
    
    thread = threading.Thread(target=init_client)
    thread.start()
    thread.join()
    
    if monitor.client and monitor.client.is_connected():
        record_event("info", "Telegram client initialized")
        return jsonify({"success": True, "message": "Client initialized successfully"})
    else:
        return jsonify({"success": False, "error": "Failed to initialize client"}), 500

@app.route('/api/channels', methods=['POST'])
def add_channel():
    data = request.json
    channel_link = (data or {}).get('link', '').strip()
    
    if not channel_link:
        return jsonify({"success": False, "error": "Channel link is required"}), 400

    if not monitor.client:
        return jsonify({"success": False, "error": "Telegram client is not initialized"}), 400
    
    result = run_async(monitor.add_channel(channel_link))
    if result["success"]:
        record_event("info", "Channel added", link=channel_link)
        return jsonify(result), 201
    else:
        return jsonify(result), 400

@app.route('/api/channels', methods=['GET'])
def get_channels():
    channels = run_async(monitor.get_channels())
    return jsonify({"channels": channels})

@app.route('/api/channels/<int:channel_id>', methods=['DELETE'])
def remove_channel(channel_id):
    success = run_async(monitor.remove_channel(channel_id))
    if success:
        record_event("info", "Channel removed", channel_id=channel_id)
        return jsonify({"success": True, "message": "Channel removed successfully"})
    else:
        return jsonify({"success": False, "error": "Failed to remove channel"}), 500

@app.route('/api/channels/<int:channel_id>/scrape/messages', methods=['POST'])
def scrape_messages(channel_id):
    result = run_async(monitor.scrape_messages(channel_id))
    if result["success"]:
        record_event("info", "Channel messages scraped", channel_id=channel_id)
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route('/api/channels/<int:channel_id>/scrape/members', methods=['POST'])
def scrape_members(channel_id):
    result = run_async(monitor.scrape_members(channel_id))
    if result["success"]:
        record_event("info", "Channel members scraped", channel_id=channel_id)
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route('/api/telegram-entities', methods=['GET'])
def get_telegram_entities():
    """List discovered Telegram entities with optional name/username search."""
    try:
        search = request.args.get("search", "")
        entities = get_explorer().repository.list_entities(search)
        metrics = get_scrape_repository().get_chat_metrics_map(
            [int(entity["telegram_id"]) for entity in entities]
        )
        return jsonify(
            {
                "success": True,
                "entities": [
                    serialize_entity(entity, metrics.get(int(entity["telegram_id"])))
                    for entity in entities
                ],
            }
        )
    except (
        ExplorerConfigurationError,
        EntityRepositoryError,
        ScrapeRepositoryError,
        TelegramExplorerError,
    ) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/refresh', methods=['POST'])
def refresh_telegram_entities():
    """Discover account-accessible groups/channels and persist the snapshot."""
    if not explorer_refresh_lock.acquire(blocking=False):
        return (
            jsonify(
                {
                    "success": False,
                    "error": "A Telegram discovery refresh is already running.",
                }
            ),
            409,
        )
    try:
        entities = run_async(get_explorer().refresh())
        metrics = get_scrape_repository().get_chat_metrics_map(
            [int(entity["telegram_id"]) for entity in entities]
        )
        return jsonify(
            {
                "success": True,
                "count": len(entities),
                "entities": [
                    serialize_entity(entity, metrics.get(int(entity["telegram_id"])))
                    for entity in entities
                ],
            }
        )
    except (
        ExplorerConfigurationError,
        EntityRepositoryError,
        ScrapeRepositoryError,
        TelegramExplorerError,
    ) as exc:
        return explorer_error_response(exc)
    finally:
        explorer_refresh_lock.release()
        record_event("info", "Telegram explorer refreshed")


@app.route('/api/telegram-entities/monitoring', methods=['GET'])
def get_monitoring_entities():
    """Return monitored groups with interval, checkpoint, and analysis metadata."""
    try:
        repository = get_explorer().repository
        entities = repository.get_monitoring_overview()
        metrics = get_scrape_repository().get_chat_metrics_map(
            [int(entity["telegram_id"]) for entity in entities]
        )
        return jsonify(
            {
                "success": True,
                "groups": [
                    serialize_entity(entity, metrics.get(int(entity["telegram_id"])))
                    for entity in entities
                    if bool(entity.get("enabled"))
                ],
            }
        )
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/<int:telegram_id>/interval', methods=['PUT'])
def update_group_interval(telegram_id):
    """Persist a per-group scrape interval in minutes."""
    payload = request.get_json(silent=True) or {}
    interval_minutes = payload.get("interval_minutes")
    if interval_minutes is None:
        interval_minutes = payload.get("interval")
    try:
        scheduler = get_scheduler()
        result = scheduler.set_group_interval(int(telegram_id), int(interval_minutes))
        record_event("info", "Group interval updated", telegram_id=telegram_id, interval_minutes=int(interval_minutes))
        return jsonify({"success": True, **result})
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "interval_minutes must be an integer"}), 400
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/<int:telegram_id>/monitor/start', methods=['POST'])
def start_group_monitoring(telegram_id):
    """Enable monitoring for one Telegram group."""
    try:
        scheduler = get_scheduler()
        result = scheduler.start_group_monitoring(int(telegram_id))
        status_code = 200 if result.get("success") else 404
        if result.get("success"):
            record_event("info", "Group monitoring started", telegram_id=telegram_id)
        return jsonify(result), status_code
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/<int:telegram_id>/monitor/stop', methods=['POST'])
def stop_group_monitoring(telegram_id):
    """Disable monitoring for one Telegram group."""
    try:
        scheduler = get_scheduler()
        result = scheduler.stop_group_monitoring(int(telegram_id))
        status_code = 200 if result.get("success") else 404
        if result.get("success"):
            record_event("info", "Group monitoring stopped", telegram_id=telegram_id)
        return jsonify(result), status_code
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/<int:telegram_id>/status', methods=['GET'])
def get_group_monitoring_status(telegram_id):
    """Return current monitoring and analysis status for one group."""
    try:
        status = get_scheduler().get_group_status(int(telegram_id))
        if status is None:
            return jsonify({"success": False, "error": "Telegram entity not found"}), 404
        return jsonify({"success": True, "group": serialize_entity(status, get_scrape_repository().get_chat_metrics(int(telegram_id)))})
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/<int:telegram_id>/memory', methods=['GET'])
def get_group_memory(telegram_id):
    """Return the latest knowledge base markdown for one group."""
    try:
        entity = get_explorer().repository.get_entity(int(telegram_id))
        if entity is None:
            return jsonify({"success": False, "error": "Telegram entity not found"}), 404
        report_state = _group_report_state(int(telegram_id))
        report_root = (BACKEND_ROOT.parent / "Reports").resolve()
        memory_path_value = report_state.get("last_memory_file")
        if memory_path_value:
            memory_path = _resolve_report_target(str(memory_path_value))
        else:
            slug = "".join(character if character.isalnum() or character in ("-", "_") else "_" for character in str(entity.get("title") or telegram_id)).strip("_") or str(telegram_id)
            memory_path = (report_root / "memory" / f"{slug}.md").resolve()
        if not memory_path.exists():
            return jsonify({"success": False, "error": "Knowledge base not found"}), 404
        return jsonify(
            {
                "success": True,
                "memory": {
                    "path": str(memory_path.relative_to(report_root)),
                    "modified_at": datetime.fromtimestamp(memory_path.stat().st_mtime, tz=timezone.utc).isoformat(),
                    "content": memory_path.read_text(encoding="utf-8"),
                },
            }
        )
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/<int:telegram_id>/reports', methods=['GET'])
def get_group_reports(telegram_id):
    """Return the generated Markdown and PDF reports for one group."""
    try:
        entity = get_explorer().repository.get_entity(int(telegram_id))
        if entity is None:
            return jsonify({"success": False, "error": "Telegram entity not found"}), 404
        report_root = BACKEND_ROOT.parent / "Reports"
        report_state = _group_report_state(int(telegram_id))
        reports = []
        preferred_paths = [
            report_state.get("last_hourly_report"),
            report_state.get("last_daily_report"),
            report_state.get("last_daily_pdf"),
            report_state.get("last_memory_file"),
        ]
        for relative_path in preferred_paths:
            if not relative_path:
                continue
            try:
                file_path = _resolve_report_target(str(relative_path))
            except FileNotFoundError:
                continue
            reports.append(
                {
                    "path": str(file_path.relative_to(report_root)),
                    "kind": "pdf" if file_path.suffix.lower() == ".pdf" else "markdown",
                    "modified_at": datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc).isoformat(),
                    "size": file_path.stat().st_size,
                }
            )
        return jsonify({"success": True, "reports": reports})
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/<int:telegram_id>/reports/download', methods=['GET'])
def download_group_report(telegram_id):
    """Download a generated report artifact for one group."""
    report_path = request.args.get("path", "").strip()
    if not report_path:
        return jsonify({"success": False, "error": "path is required"}), 400
    try:
        target = _resolve_report_target(report_path)
        download_name = target.name
        mime_type = "application/pdf" if target.suffix.lower() == ".pdf" else "text/markdown; charset=utf-8"
        return send_file(target, mimetype=mime_type, as_attachment=True, download_name=download_name)
    except FileNotFoundError:
        return jsonify({"success": False, "error": "Report not found"}), 404
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400


@app.route('/api/telegram-entities/<int:telegram_id>/reports/generate', methods=['POST'])
def generate_group_report(telegram_id):
    """Force regeneration of the group memory and daily report artifacts."""
    try:
        entity = get_explorer().repository.get_entity(int(telegram_id))
        if entity is None:
            return jsonify({"success": False, "error": "Telegram entity not found"}), 404
        messages = get_scrape_repository().list_messages(int(telegram_id))
        report_state = get_report_agent().update_group_memory(entity, messages, scraped_at=datetime.now(IST))
        record_event("info", "Group report generated", telegram_id=telegram_id)
        return jsonify({"success": True, "report": report_state})
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/selection', methods=['PUT'])
def save_telegram_entity_selection():
    """Persist enabled and disabled states for the submitted visible entities."""
    data = request.get_json(silent=True) or {}
    enabled_ids = data.get("enabled_ids")
    disabled_ids = data.get("disabled_ids")
    if not isinstance(enabled_ids, list) or not isinstance(disabled_ids, list):
        return (
            jsonify(
                {
                    "success": False,
                    "error": "enabled_ids and disabled_ids must be arrays.",
                }
            ),
            400,
        )
    try:
        enabled = [int(identifier) for identifier in enabled_ids]
        disabled = [int(identifier) for identifier in disabled_ids]
    except (TypeError, ValueError):
        return (
            jsonify({"success": False, "error": "Telegram IDs must be integers."}),
            400,
        )
    if set(enabled).intersection(disabled):
        return (
            jsonify(
                {
                    "success": False,
                    "error": "An entity cannot be both enabled and disabled.",
                }
            ),
            400,
        )
    try:
        repository = get_explorer().repository
        modified = repository.set_enabled(enabled, True)
        modified += repository.set_enabled(disabled, False)
        return jsonify({"success": True, "modified_count": modified})
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/<int:telegram_id>/scrape', methods=['POST'])
def scrape_telegram_entity(telegram_id):
    """Scrape all available messages for one discovered Telegram entity."""
    try:
        scheduler = get_scheduler()
        result = scheduler.run_entity_now(telegram_id, full_history=True)
        if result.get("success"):
            status_code = 200
            record_event("info", "Telegram entity scrape completed", telegram_id=telegram_id)
        else:
            error_message = str(result.get("error", ""))
            if "already active" in error_message:
                status_code = 409
            elif "not known" in error_message:
                status_code = 404
            else:
                status_code = 400
            record_event("warning", "Telegram entity scrape failed", telegram_id=telegram_id, error=error_message)
        return jsonify(result), status_code
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/telegram-entities/<int:telegram_id>', methods=['DELETE'])
def delete_telegram_entity(telegram_id):
    """Delete a discovered Telegram entity from MongoDB."""
    try:
        repository = get_explorer().repository
        removed = repository.delete_entity(int(telegram_id))
        if removed:
            record_event("info", "Telegram entity deleted", telegram_id=telegram_id)
            return jsonify({"success": True, "message": "Entity deleted successfully"})
        return jsonify({"success": False, "error": "Entity not found"}), 404
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/scheduler', methods=['GET'])
def get_scheduler_status():
    try:
        scheduler = get_scheduler()
        return jsonify({"success": True, "scheduler": scheduler.status()})
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/scheduler', methods=['POST'])
def configure_scheduler():
    data = request.get_json(silent=True) or {}
    run_at = data.get("run_at", os.getenv("TELEGRAM_SCHEDULER_TIME", "02:00"))
    interval_hours = int(data.get("interval_hours", 24))
    hour, minute = [int(part) for part in str(run_at).split(":", 1)]
    save_settings(
        {
            "scheduler_run_at": f"{hour:02d}:{minute:02d}",
            "scheduler_interval_hours": interval_hours,
        }
    )
    scheduler = get_scheduler()
    scheduler.configure(SchedulerConfig(run_at=time(hour=hour, minute=minute), interval_hours=interval_hours))
    scheduler.start()
    record_event("info", "Scheduler configured", run_at=f"{hour:02d}:{minute:02d}", interval_hours=interval_hours)
    return jsonify({"success": True, "scheduler": scheduler.status()})


@app.route('/api/scheduler/run', methods=['POST'])
def run_scheduler_now():
    scheduler = get_scheduler()
    result = scheduler.start_now()
    status_code = 200 if result.get("success") else 409
    record_event("info" if status_code == 200 else "warning", "Scheduler run requested", status_code=status_code)
    return jsonify(result), status_code


@app.route('/api/scheduler/start', methods=['POST'])
def start_selected_scraping():
    """Start scraping a selected set of entities in the background (non-blocking)."""
    data = request.get_json(silent=True) or {}
    selected_ids = data.get("selected_ids")
    if not isinstance(selected_ids, list) or not selected_ids:
        return jsonify({"success": False, "error": "selected_ids must be a non-empty array."}), 400
    try:
        telegram_ids = [int(identifier) for identifier in selected_ids]
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "selected_ids must contain integers."}), 400
    scheduler = get_scheduler()
    # Non-blocking: returns immediately, scraping runs in background thread
    result = scheduler.run_selected_now(telegram_ids)
    status_code = 200 if result.get("success") else 409
    record_event(
        "info" if status_code == 200 else "warning",
        "Selected scraping requested",
        selected_ids=telegram_ids,
        status_code=status_code,
    )
    return jsonify(result), status_code


@app.route('/api/scraper/progress', methods=['GET'])
def get_scraper_progress():
    """Lightweight polling endpoint for live scraping progress."""
    try:
        scheduler = get_scheduler()
        s = scheduler.status()
        return jsonify({
            "success": True,
            "running": s.get("running", False),
            "active": s.get("active", False),
            "active_entity": s.get("active_entity"),
            "queue": s.get("queue", []),
            "queue_length": len(s.get("queue", [])),
            "last_results": s.get("last_results", []),
            "run_count": s.get("run_count", 0),
            "last_run_started_at": s.get("last_run_started_at"),
            "last_run_finished_at": s.get("last_run_finished_at"),
            "next_run_at": s.get("next_run_at"),
            "interval_hours": s.get("interval_hours"),
        })
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/scraper/entity-stats', methods=['GET'])
def get_scraper_entity_stats():
    """Return per-entity scrape statistics for the Scraper page."""
    try:
        stats = get_scrape_repository().get_per_entity_stats()
        return jsonify({"success": True, "stats": stats})
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError) as exc:
        return explorer_error_response(exc)


@app.route('/api/messages/<int:message_id>', methods=['DELETE'])
def delete_message(message_id):
    """Delete one message from MongoDB by its Telegram message_id."""
    try:
        deleted = get_scrape_repository().delete_message(message_id)
        if deleted:
            record_event("info", "Message deleted", message_id=message_id)
            return jsonify({"success": True, "message": "Message deleted."})
        return jsonify({"success": False, "error": "Message not found."}), 404
    except (ScrapeRepositoryError,) as exc:
        return explorer_error_response(exc)


@app.route('/api/messages', methods=['GET'])
def get_messages():
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 50))
        search = request.args.get("search", "")
        sort_by = request.args.get("sort_by", "message_date")
        sort_order = request.args.get("sort_order", "desc")
        chat_id = request.args.get("chat_id")
        telegram_id = int(chat_id) if chat_id not in (None, "", "null") else None
        result = get_scrape_repository().query_messages(
            page=page,
            page_size=page_size,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
            chat_id=telegram_id,
        )
        return jsonify({"success": True, **result})
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/monitoring', methods=['GET'])
def get_monitoring():
    try:
        scheduler = get_scheduler().status()
        storage_stats = get_scrape_repository().get_dashboard_stats()
        latest_message = get_scrape_repository().get_latest_message() or {}
        status = MONITORING_STATE["status"]
        running = bool(scheduler.get("running") or scheduler.get("active")) and status not in {"stopped", "paused"}
        return jsonify(
            {
                "success": True,
                "running": running,
                "status": "Running" if running else status.capitalize(),
                "last_message": latest_message.get("text") or latest_message.get("message_text"),
                "messages_today": storage_stats["messages_collected_today"],
                "last_sync": latest_message.get("created_at") or latest_message.get("message_date") or latest_message.get("date"),
            }
        )
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


def _set_monitoring_status(status: str):
    MONITORING_STATE["status"] = status
    MONITORING_STATE["updated_at"] = datetime.now(timezone.utc).isoformat()


@app.route('/api/monitoring/pause', methods=['POST'])
def pause_monitoring():
    try:
        get_scheduler().stop()
        _set_monitoring_status("paused")
        record_event("info", "Monitoring paused")
        return jsonify({"success": True, "status": "paused"})
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/monitoring/resume', methods=['POST'])
def resume_monitoring():
    try:
        get_scheduler().start()
        _set_monitoring_status("running")
        record_event("info", "Monitoring resumed")
        return jsonify({"success": True, "status": "running"})
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/monitoring/stop', methods=['POST'])
def stop_monitoring():
    try:
        get_scheduler().stop()
        _set_monitoring_status("stopped")
        record_event("info", "Monitoring stopped")
        return jsonify({"success": True, "status": "stopped"})
    except (ExplorerConfigurationError, EntityRepositoryError, ScrapeRepositoryError, ValueError) as exc:
        return explorer_error_response(exc)


@app.route('/api/logs', methods=['GET'])
def get_logs():
    try:
        search = request.args.get("search", "")
        level = request.args.get("level", "")
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))
        items = load_events(search=search, level=level, limit=limit, offset=offset)
        return jsonify({"success": True, "items": items, "total": len(items)})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route('/api/reports', methods=['GET'])
def get_reports():
    try:
        return jsonify({"success": True, "reports": _scan_report_files(), "state": get_report_agent().latest_reports()})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route('/api/reports/content', methods=['GET'])
def get_report_content():
    report_path = request.args.get("path", "").strip()
    if not report_path:
        return jsonify({"success": False, "error": "path is required"}), 400
    try:
        return jsonify({"success": True, "report": _read_report_file(report_path)})
    except FileNotFoundError:
        return jsonify({"success": False, "error": "Report not found"}), 404
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route('/api/reports/download', methods=['GET'])
def download_report_file():
    report_path = request.args.get("path", "").strip()
    if not report_path:
        return jsonify({"success": False, "error": "path is required"}), 400
    try:
        target = _resolve_report_target(report_path)
        download_name = target.name
        mime_type = "application/pdf" if target.suffix.lower() == ".pdf" else "text/markdown; charset=utf-8"
        return send_file(target, mimetype=mime_type, as_attachment=True, download_name=download_name)
    except FileNotFoundError:
        return jsonify({"success": False, "error": "Report not found"}), 404
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route('/api/settings', methods=['GET'])
def get_settings():
    try:
        return jsonify({"success": True, "settings": load_settings()})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route('/api/settings', methods=['PUT'])
def update_settings():
    payload = request.get_json(silent=True) or {}
    settings = payload.get("settings", payload)
    if not isinstance(settings, dict):
        return jsonify({"success": False, "error": "settings must be an object"}), 400
    try:
        updated = save_settings(settings)
        record_event("info", "Settings updated")
        return jsonify({"success": True, "settings": updated})
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route('/api/exports', methods=['GET'])
def get_exports():
    """List CSV and data export files from the data directory."""
    try:
        data_root = (BACKEND_ROOT.parent / "data").resolve()
        if not data_root.exists():
            return jsonify({"success": True, "files": [], "total_size": 0})
        csv_files = sorted(
            [*data_root.rglob("*.csv"), *data_root.rglob("*.json")],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        files = []
        total_size = 0
        for file_path in csv_files[:200]:
            stat = file_path.stat()
            total_size += stat.st_size
            files.append({
                "name": file_path.name,
                "path": str(file_path.relative_to(data_root)),
                "size": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            })
        return jsonify({"success": True, "files": files, "total_size": total_size})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route('/api/exports/download', methods=['GET'])
def download_export_file():
    """Download a data export file."""
    export_path = request.args.get("path", "").strip()
    if not export_path:
        return jsonify({"success": False, "error": "path is required"}), 400
    try:
        data_root = (BACKEND_ROOT.parent / "data").resolve()
        target = (data_root / export_path).resolve()
        if data_root not in target.parents and target != data_root:
            raise ValueError("Invalid export path")
        if not target.exists() or not target.is_file():
            raise FileNotFoundError(export_path)
        mime = "text/csv; charset=utf-8" if target.suffix.lower() == ".csv" else "application/octet-stream"
        return send_file(target, mimetype=mime, as_attachment=True, download_name=target.name)
    except FileNotFoundError:
        return jsonify({"success": False, "error": "File not found"}), 404
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


def main():
    """Run the Flask development server without the unstable Windows reloader."""
    debug_enabled = os.getenv("FLASK_DEBUG", "1").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    
    import logging
    try:
        get_scheduler()
    except Exception as e:
        logging.error(f"Failed to auto-start scheduler: {e}")

    app.run(
        debug=debug_enabled,
        use_reloader=False,
        host="0.0.0.0",
        port=5000,
    )


if __name__ == '__main__':
    main()
