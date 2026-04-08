from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8001
    # OPENAI_API_KEY: str
    GEMINI_API_KEY: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    class Config:
        env_file = ".env"

settings = Settings()
