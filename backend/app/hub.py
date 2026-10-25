"""WebSocket fan-out hub that broadcasts agent events to every connected dashboard."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict, deque

from fastapi import WebSocket

from .schemas import AgentEvent

logger = logging.getLogger("ghostoperator.hub")

REPLAY_LIMIT = 400


class EventHub:
    def __init__(self) -> None:
        self._clients: dict[WebSocket, str | None] = {}
        self._history: dict[str, deque[str]] = defaultdict(lambda: deque(maxlen=REPLAY_LIMIT))
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, mission_id: str | None) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients[websocket] = mission_id
        if mission_id and mission_id in self._history:
            for payload in list(self._history[mission_id]):
                await websocket.send_text(payload)

    async def subscribe(self, websocket: WebSocket, mission_id: str | None) -> None:
        async with self._lock:
            if websocket in self._clients:
                self._clients[websocket] = mission_id
        if mission_id and mission_id in self._history:
            for payload in list(self._history[mission_id]):
                await websocket.send_text(payload)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.pop(websocket, None)

    async def publish(self, event: AgentEvent) -> None:
        payload = event.model_dump_json(exclude_none=True)
        if event.type != "frame":
            self._history[event.mission_id].append(payload)
        async with self._lock:
            targets = [ws for ws, sub in self._clients.items() if sub in (None, event.mission_id)]
        stale: list[WebSocket] = []
        for websocket in targets:
            try:
                await websocket.send_text(payload)
            except Exception:
                stale.append(websocket)
        if stale:
            async with self._lock:
                for websocket in stale:
                    self._clients.pop(websocket, None)
            logger.debug("Dropped %d stale websocket clients", len(stale))


hub = EventHub()
