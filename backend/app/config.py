from pydantic_settings import BaseSettings

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
    FB_PAGE_ACCESS_TOKEN: str = ""                        # Facebook Page Access Token (từ Developer Portal)
    FB_VERIFY_TOKEN: str = "change-this-verify-token"    # Verify token khi đăng ký Webhook FB

    class Config:
        env_file = ".env"

settings = Settings()