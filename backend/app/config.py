import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)

class Settings:
    PROJECT_NAME: str = "Telegram Darknet Monitor"
    VERSION: str = "1.0.0"
    
    # MongoDB Configuration
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "darknet_monitor")
    
    # Telegram API Credentials
    TELEGRAM_API_ID: int = int(os.getenv("TELEGRAM_API_ID", "0"))
    TELEGRAM_API_HASH: str = os.getenv("TELEGRAM_API_HASH", "")
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    # Local LLM Configuration (Ollama / LM Studio / LocalAI / vLLM)
    USE_LOCAL_LLM: bool = os.getenv("USE_LOCAL_LLM", "true").lower() in ("true", "1", "yes")
    LOCAL_LLM_URL: str = os.getenv("LOCAL_LLM_URL", "http://localhost:11434/api/generate")
    LOCAL_LLM_MODEL: str = os.getenv("LOCAL_LLM_MODEL", "llama3")
    
    # Cloud LLM Fallback (OpenAI / Custom)
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
    
    # Storage Paths
    BASE_DIR: Path = Path(__file__).resolve().parents[2]
    REPORTS_DIR: Path = BASE_DIR / "Reports"
    DATA_DIR: Path = BASE_DIR / "data"

settings = Settings()

# Ensure directories exist
settings.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
(settings.REPORTS_DIR / "daily").mkdir(exist_ok=True)
(settings.REPORTS_DIR / "hourly").mkdir(exist_ok=True)
(settings.REPORTS_DIR / "pdf").mkdir(exist_ok=True)
(settings.REPORTS_DIR / "combined").mkdir(exist_ok=True)
(settings.DATA_DIR / "media").mkdir(parents=True, exist_ok=True)
