"""Request, response and event models shared by the REST and WebSocket layers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

Provider = Literal["gemini", "anthropic"]
Phase = Literal["PERCEIVE", "REASON", "ACT", "VALIDATE"]
MissionStatus = Literal["queued", "running", "complete", "failed", "cancelled"]
EventType = Literal[
    "mission_started",
    "phase",
    "frame",
    "log",
    "metrics",
    "mission_complete",
    "mission_failed",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RunMissionRequest(BaseModel):
    mission: str = Field(min_length=3, max_length=4000)
    max_steps: int = Field(default=25, ge=1, le=100)
    target_url: str | None = Field(default=None, max_length=2048)
    model_provider: Provider = "gemini"
    demo_mode: bool = False


class RunMissionResponse(BaseModel):
    mission_id: str
    status: MissionStatus
    mode: Literal["live", "demo"]
    provider: Provider
    model: str
    reason: str | None = None


class ActionInfo(BaseModel):
    name: str
    params: dict[str, Any] = Field(default_factory=dict)


class AgentEvent(BaseModel):
    type: EventType
    mission_id: str
    timestamp: str = Field(default_factory=utc_now)
    step: int | None = None
    phase: Phase | None = None
    url: str | None = None
    title: str | None = None
    message: str | None = None
    thought: str | None = None
    evaluation: str | None = None
    memory: str | None = None
    next_goal: str | None = None
    actions: list[ActionInfo] = Field(default_factory=list)
    dom_elements: int | None = None
    screenshot: str | None = None
    success: bool | None = None
    error: str | None = None
    latency_ms: float | None = None
    tokens: int | None = None
    data: Any = None
    simulated: bool = False


class MissionRecord(BaseModel):
    mission_id: str
    mission: str
    target_url: str | None
    provider: Provider
    model: str
    mode: Literal["live", "demo"]
    status: MissionStatus
    max_steps: int
    created_at: str = Field(default_factory=utc_now)
    finished_at: str | None = None
    steps: int = 0
    tokens: int = 0
    final_result: str | None = None
    records: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None
    has_recording: bool = False
    has_csv: bool = False
