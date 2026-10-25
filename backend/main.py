"""GhostOperator (codename AetherBrowser) — FastAPI service for autonomous browser missions."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator, Literal

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from app.config import settings
from app.demo_agent import DemoMission
from app.hub import hub
from app.live_agent import LiveMission, LLMConfigurationError, model_for
from app.schemas import AgentEvent, MissionRecord, Provider, RunMissionRequest, RunMissionResponse, utc_now
from app.storage import list_records, load_record, mission_dir, records_to_csv, recording_path, save_record

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ghostoperator")

PROVIDER_ERROR_MARKERS = (
    "api key", "api_key", "unauthenticated", "permission_denied", "401", "403", "invalid x-api-key",
    "authentication", "404 not_found", "not_found_error", "resource_exhausted", "429",
)

Runner = LiveMission | DemoMission


class MissionManager:
    def __init__(self) -> None:
        self.runners: dict[str, Runner] = {}
        self.tasks: dict[str, asyncio.Task[None]] = {}

    def active_mission(self) -> str | None:
        for mission_id, task in self.tasks.items():
            if not task.done():
                return mission_id
        return None

    def resolve_mode(self, request: RunMissionRequest) -> tuple[Literal["live", "demo"], str | None]:
        if request.demo_mode:
            return "demo", "Demo mode requested"
        if settings.force_demo:
            return "demo", "FORCE_DEMO_MODE is enabled"
        if not settings.provider_available(request.model_provider):
            key = "ANTHROPIC_API_KEY" if request.model_provider == "anthropic" else "GEMINI_API_KEY"
            return "demo", f"{key} is not configured"
        return "live", None

    async def launch(self, request: RunMissionRequest) -> RunMissionResponse:
        active = self.active_mission()
        if active:
            raise HTTPException(status_code=409, detail=f"Mission {active} is still running")
        mode, reason = self.resolve_mode(request)
        mission_id = uuid.uuid4().hex[:12]
        mission_dir(mission_id)
        record = MissionRecord(
            mission_id=mission_id,
            mission=request.mission,
            target_url=request.target_url or None,
            provider=request.model_provider,
            model=model_for(request.model_provider) if mode == "live" else f"{model_for(request.model_provider)} (simulated)",
            mode=mode,
            status="queued",
            max_steps=request.max_steps,
        )
        await save_record(record)
        self.tasks[mission_id] = asyncio.create_task(self._execute(record, reason))
        return RunMissionResponse(mission_id=mission_id, status="queued", mode=mode, provider=record.provider, model=record.model, reason=reason)

    async def _execute(self, record: MissionRecord, reason: str | None) -> None:
        runner: Runner = LiveMission(record) if record.mode == "live" else DemoMission(record, reason or "Demo mode")
        self.runners[record.mission_id] = runner
        try:
            result = await runner.run()
            if isinstance(runner, LiveMission) and result.status == "failed" and runner.reasoned_steps == 0 and _is_provider_error(result.error):
                await self._fallback(record, f"LLM provider unavailable ({(result.error or '')[:160]})")
                return
        except LLMConfigurationError as exc:
            await self._fallback(record, str(exc))
            return
        except asyncio.CancelledError:
            record.status = "cancelled"
            result = record
        except Exception as exc:
            logger.exception("Mission %s crashed", record.mission_id)
            if isinstance(runner, LiveMission) and runner.reasoned_steps == 0 and _is_provider_error(str(exc)):
                await self._fallback(record, f"LLM provider unavailable ({str(exc)[:160]})")
                return
            record.status = "failed"
            record.error = f"{type(exc).__name__}: {exc}"[:2000]
            result = record
        await self._finish(result)

    async def _fallback(self, record: MissionRecord, reason: str) -> None:
        await hub.publish(AgentEvent(type="log", mission_id=record.mission_id, simulated=True,
                                     message=f"Live execution unavailable: {reason}. Switching to demo mode."))
        record.mode = "demo"
        record.model = f"{model_for(record.provider)} (simulated)"
        record.error = None
        runner = DemoMission(record, reason)
        self.runners[record.mission_id] = runner
        await self._finish(await runner.run())

    async def _finish(self, record: MissionRecord) -> None:
        record.finished_at = utc_now()
        await save_record(record)
        simulated = record.mode == "demo"
        if record.status == "complete":
            await hub.publish(AgentEvent(type="mission_complete", mission_id=record.mission_id, simulated=simulated,
                                         message=record.final_result, data=record.model_dump(), tokens=record.tokens, step=record.steps))
        else:
            await hub.publish(AgentEvent(type="mission_failed", mission_id=record.mission_id, simulated=simulated,
                                         error=record.error or record.status, data=record.model_dump(), step=record.steps))

    def stop(self, mission_id: str) -> bool:
        runner = self.runners.get(mission_id)
        task = self.tasks.get(mission_id)
        if runner is None or task is None or task.done():
            return False
        runner.stop()
        return True

    async def shutdown(self) -> None:
        for mission_id in list(self.tasks):
            self.stop(mission_id)
        pending = [t for t in self.tasks.values() if not t.done()]
        if pending:
            await asyncio.wait(pending, timeout=10)


def _is_provider_error(message: str | None) -> bool:
    lowered = (message or "").lower()
    return any(marker in lowered for marker in PROVIDER_ERROR_MARKERS)


manager = MissionManager()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("GhostOperator online — gemini=%s anthropic=%s headless=%s",
                bool(settings.gemini_api_key), bool(settings.anthropic_api_key), settings.headless)
    yield
    await manager.shutdown()


app = FastAPI(title="GhostOperator API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "headless": settings.headless,
        "active_mission": manager.active_mission(),
        "providers": {
            "gemini": {"configured": settings.provider_available("gemini"), "model": settings.gemini_model},
            "anthropic": {"configured": settings.provider_available("anthropic"), "model": settings.anthropic_model},
        },
        "demo_fallback": not (settings.provider_available("gemini") or settings.provider_available("anthropic")) or settings.force_demo,
    }


@app.post("/api/run-mission", response_model=RunMissionResponse)
async def run_mission(request: RunMissionRequest) -> RunMissionResponse:
    return await manager.launch(request)


@app.post("/api/missions/{mission_id}/stop")
async def stop_mission(mission_id: str) -> dict[str, object]:
    return {"mission_id": mission_id, "stopping": manager.stop(mission_id)}


@app.get("/api/missions", response_model=list[MissionRecord])
async def missions() -> list[MissionRecord]:
    return list_records()


def _require(mission_id: str) -> MissionRecord:
    try:
        record = load_record(mission_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid mission id") from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Mission not found")
    return record


@app.get("/api/missions/{mission_id}", response_model=MissionRecord)
async def mission(mission_id: str) -> MissionRecord:
    return _require(mission_id)


@app.get("/api/missions/{mission_id}/data.json")
async def mission_json(mission_id: str) -> Response:
    record = _require(mission_id)
    body = json.dumps({"records": record.records, "final_result": record.final_result}, indent=2, ensure_ascii=False)
    return Response(content=body, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="mission-{mission_id}.json"'})


@app.get("/api/missions/{mission_id}/data.csv")
async def mission_csv(mission_id: str) -> Response:
    record = _require(mission_id)
    return Response(content=records_to_csv(record.records), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="mission-{mission_id}.csv"'})


@app.get("/api/missions/{mission_id}/recording")
async def mission_recording(mission_id: str) -> FileResponse:
    _require(mission_id)
    path = recording_path(mission_id)
    if path is None:
        raise HTTPException(status_code=404, detail="No recording for this mission")
    return FileResponse(path, media_type="video/mp4" if path.suffix == ".mp4" else "video/webm")


@app.websocket("/ws/agent")
async def agent_socket(websocket: WebSocket) -> None:
    mission_id = websocket.query_params.get("mission_id")
    await hub.connect(websocket, mission_id)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if message.get("type") == "subscribe":
                await hub.subscribe(websocket, message.get("mission_id"))
            elif message.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong", "timestamp": utc_now()}))
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(websocket)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=settings.port, log_level="info")
