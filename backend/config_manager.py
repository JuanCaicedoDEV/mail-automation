import os
import sys
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _load_dotenv():
    """
    Load a .env file from the project root (or any parent directory up to 4 levels).
    Used in development so credentials in .env work without the settings screen.
    config.json values always take priority — this only fills in missing variables.
    """
    check = Path(__file__).parent  # start from backend/
    for _ in range(5):
        candidate = check / ".env"
        if candidate.exists():
            try:
                with open(candidate) as f:
                    for raw in f:
                        line = raw.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        key, _, value = line.partition("=")
                        key = key.strip()
                        value = value.strip().strip('"').strip("'")
                        # Only set if not already in environment (don't override)
                        if key and value and key not in os.environ:
                            os.environ[key] = value
                logger.info(f"Loaded .env from {candidate}")
            except Exception as e:
                logger.warning(f"Could not load .env: {e}")
            return
        check = check.parent


# Load .env early so os.getenv() calls in other modules work immediately
_load_dotenv()


def get_app_dir() -> Path:
    """Returns the persistent app data directory for config, DB, and user files."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "EmailAutomation"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", str(Path.home()))) / "EmailAutomation"
    else:
        base = Path.home() / ".emailautomation"
    base.mkdir(parents=True, exist_ok=True)
    return base


APP_DIR = get_app_dir()
CONFIG_PATH = APP_DIR / "config.json"
DB_PATH = str(APP_DIR / "app.db")

# Sub-dirs for file storage
(APP_DIR / "generated_images").mkdir(exist_ok=True)
(APP_DIR / "uploads").mkdir(exist_ok=True)


def _default_config() -> dict:
    return {
        "gemini_api_key": "",
        "google_client_id": "",       # Zoho OAuth Client ID
        "google_client_secret": "",   # Zoho OAuth Client Secret
        "google_redirect_uri": "http://127.0.0.1:8000/auth/zoho/callback",
        "zoho_email": "",             # Sender email address in Zoho
        "zoho_refresh_token": "",     # Saved automatically after OAuth flow
        "zoho_account_id": "",        # Saved automatically after OAuth flow
        "gmail_user": "",
        "gmail_app_password": "",
        "storage_provider": "local",
        "supabase_url": "",
        "supabase_key": "",
        "supabase_bucket": "content-assets",
        "public_url": "http://127.0.0.1:8000",
    }


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH) as f:
                config = json.load(f)
            # Fill in any keys added in newer versions
            for k, v in _default_config().items():
                if k not in config:
                    config[k] = v
            return config
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
    config = _default_config()
    save_config(config)
    return config


def save_config(config: dict):
    try:
        with open(CONFIG_PATH, "w") as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save config: {e}")


def inject_into_env(config: dict):
    """Inject config values into os.environ so all existing code picks them up."""
    # Each config key maps to one or more env var names
    mapping = {
        "gemini_api_key":      ["GEMINI_API_KEY"],
        # google_client_id/secret store Zoho OAuth credentials (historical naming)
        "google_client_id":    ["GOOGLE_CLIENT_ID", "ZOHO_CLIENT_ID"],
        "google_client_secret":["GOOGLE_CLIENT_SECRET", "ZOHO_CLIENT_SECRET"],
        "google_redirect_uri": ["GOOGLE_REDIRECT_URI"],
        "zoho_email":          ["ZOHO_EMAIL"],
        "zoho_refresh_token":  ["ZOHO_REFRESH_TOKEN"],
        "zoho_account_id":     ["ZOHO_ACCOUNT_ID"],
        "gmail_user":          ["GMAIL_USER"],
        "gmail_app_password":  ["GMAIL_APP_PASSWORD"],
        "storage_provider":    ["STORAGE_PROVIDER"],
        "supabase_url":        ["SUPABASE_URL"],
        "supabase_key":        ["SUPABASE_KEY"],
        "supabase_bucket":     ["SUPABASE_BUCKET"],
        "public_url":          ["PUBLIC_URL", "API_URL"],  # used under both names
    }
    for cfg_key, env_keys in mapping.items():
        val = config.get(cfg_key)
        if val:
            for env_key in env_keys:
                os.environ[env_key] = val


def is_setup_complete(config: dict) -> bool:
    """Minimum viable setup: Gemini API key required (from config.json or .env)."""
    return bool(config.get("gemini_api_key") or os.getenv("GEMINI_API_KEY"))


def get_masked_config(config: dict) -> dict:
    """Return config safe for the frontend (sensitive values masked)."""
    masked = config.copy()
    for key in ("gemini_api_key", "google_client_secret", "gmail_app_password",
                "supabase_key", "zoho_refresh_token"):
        val = masked.get(key, "")
        if val:
            masked[key] = val[:4] + "****" + val[-4:] if len(val) > 8 else "****"
    return masked
