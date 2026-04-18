import logging
from pydantic_settings import BaseSettings

_logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    DATABASE_URL: str
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8001
    GEMINI_API_KEY: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    NOTIFICATION_SECRET: str = "default-notification-secret"

    # n8n / Facebook Messenger integration
    N8N_SECRET: str = "change-this-n8n-secret"          # Secret key để n8n gọi API backend
    FB_PAGE_ACCESS_TOKEN: str = ""                       # Facebook Page Access Token (từ Developer Portal)
    FB_VERIFY_TOKEN: str = "change-this-verify-token"    # Verify token khi đăng ký Webhook FB
    FB_PAGE_ID: str = ""                                 # Facebook Page ID (dùng cho Graph API)
    FB_APP_SECRET: str = ""                              # Facebook App Secret (verify webhook signature)
    N8N_AI_WEBHOOK_URL: str = "http://localhost:5678/webhook/ai-chat" # N8n AI Intent Webhook

    class Config:
        env_file = ".env"

settings = Settings()

# ── Cảnh báo nếu vẫn dùng secret mặc định ────────────────────────────────────
_WEAK_DEFAULTS = {
    "N8N_SECRET": "change-this-n8n-secret",
    "FB_VERIFY_TOKEN": "change-this-verify-token",
    "NOTIFICATION_SECRET": "default-notification-secret",
}
for _key, _default in _WEAK_DEFAULTS.items():
    if getattr(settings, _key) == _default:
        _logger.warning(
            f"⚠️  {_key} đang dùng giá trị mặc định! "
            f"Hãy đổi trong file .env trước khi deploy production."
        )
