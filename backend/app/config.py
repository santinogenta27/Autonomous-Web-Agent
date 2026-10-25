"""Runtime configuration loaded from the project-level and backend-level .env files."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent

load_dotenv(PROJECT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env", override=True)

PLACEHOLDER_MARKERS = ("your_", "optional_", "_here", "changeme")


def _clean_key(raw: str | None) -> str | None:
    if not raw:
        return None
    value = raw.strip()
    if not value or any(marker in value.lower() for marker in PLACEHOLDER_MARKERS):
        return None
    return value


def _as_bool(raw: str | None, default: bool) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _parse_size(raw: str) -> tuple[int, int]:
    width, _, height = raw.lower().partition("x")
    return max(int(width), 100), max(int(height), 100)


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str | None
    anthropic_api_key: str | None
    gemini_model: str
    anthropic_model: str
    headless: bool
    port: int
    storage_dir: Path
    force_demo: bool
    llm_timeout: int
    gemini_thinking_level: str | None
    max_actions_per_step: int
    agent_use_thinking: bool
    llm_screenshot_size: tuple[int, int]
    wait_between_actions: float
    min_page_load_wait: float
    network_idle_wait: float

    def provider_available(self, provider: str) -> bool:
        if provider == "anthropic":
            return self.anthropic_api_key is not None
        return self.gemini_api_key is not None


def load_settings() -> Settings:
    storage = BACKEND_DIR / "storage" / "missions"
    storage.mkdir(parents=True, exist_ok=True)
    return Settings(
        gemini_api_key=_clean_key(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")),
        anthropic_api_key=_clean_key(os.getenv("ANTHROPIC_API_KEY")),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
        anthropic_model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
        headless=_as_bool(os.getenv("HEADLESS_BROWSER"), default=False),
        port=int(os.getenv("PORT", "8000")),
        storage_dir=storage,
        force_demo=_as_bool(os.getenv("FORCE_DEMO_MODE"), default=False),
        llm_timeout=int(os.getenv("LLM_TIMEOUT_SECONDS", "150")),
        gemini_thinking_level=os.getenv("GEMINI_THINKING_LEVEL", "low").strip().lower() or None,
        max_actions_per_step=int(os.getenv("MAX_ACTIONS_PER_STEP", "8")),
        agent_use_thinking=_as_bool(os.getenv("AGENT_USE_THINKING"), default=False),
        llm_screenshot_size=_parse_size(os.getenv("LLM_SCREENSHOT_SIZE", "1024x640")),
        wait_between_actions=float(os.getenv("WAIT_BETWEEN_ACTIONS", "0.1")),
        min_page_load_wait=float(os.getenv("MIN_PAGE_LOAD_WAIT", "0.2")),
        network_idle_wait=float(os.getenv("NETWORK_IDLE_WAIT", "0.4")),
    )


settings = load_settings()
