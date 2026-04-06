from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    APP_SECRET: str = "change-me-in-production"
    ACCESS_TOKEN_TTL_MINUTES: int = 60 * 24
    EMAIL_CODE_TTL_MINUTES: int = 10
    EMAIL_RESEND_COOLDOWN_SECONDS: int = 60
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCK_MINUTES: int = 15

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "no-reply@sports.local"
    SMTP_USE_TLS: bool = True

    AUTH_DEV_EXPOSE_CODE: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
