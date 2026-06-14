from functools import lru_cache
from pathlib import Path
from typing import Annotated
from uuid import UUID

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WORKTRACE_", env_file=".env", extra="ignore")

    env: str = "development"
    database_url: str = "sqlite:///./data/worktrace.sqlite3"
    recording_storage_path: Path = Path("./data/recordings")
    max_chunk_bytes: int = 10 * 1024 * 1024
    tenant_id: UUID = UUID("00000000-0000-0000-0000-000000000001")
    api_token: SecretStr = SecretStr("development-only-token")
    allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    allowed_domains: Annotated[list[str], NoDecode] = []
    ai_provider: str = "local"
    external_ai_enabled: bool = False
    external_ai_approval_required: bool = True

    @field_validator("allowed_origins", "allowed_domains", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def production_settings_are_fail_closed(self) -> "Settings":
        if self.env != "development":
            if self.api_token.get_secret_value() == "development-only-token":
                raise ValueError("Production requires a non-default API token")
            if not self.allowed_domains:
                raise ValueError("Production requires an explicit recording-domain allowlist")
        return self

    def ensure_local_directories(self) -> None:
        if self.database_url.startswith("sqlite:///"):
            database_path = Path(self.database_url.removeprefix("sqlite:///"))
            database_path.parent.mkdir(parents=True, exist_ok=True)
        self.recording_storage_path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_local_directories()
    return settings
