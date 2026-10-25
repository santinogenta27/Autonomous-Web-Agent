"""Live mission execution: drives a real Chromium through browser-use and streams every phase."""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from typing import Any

from browser_use import Agent, BrowserProfile
from browser_use.agent.views import AgentOutput
from browser_use.browser.views import BrowserStateSummary
from browser_use.llm import ChatAnthropic, ChatGoogle
from browser_use.llm.base import BaseChatModel

from .config import settings
from .hub import hub
from .schemas import ActionInfo, AgentEvent, MissionRecord, Provider
from .storage import extract_records, finalize_recording, mission_dir, save_record, save_structured_data, write_json

logger = logging.getLogger("ghostoperator.live")

FRAME_INTERVAL_SECONDS = 1.0

OUTPUT_CONTRACT = """
When you call the `done` action, the `text` field MUST contain the extracted results as a JSON array of flat objects
inside a ```json code fence (one object per row, consistent keys, string or number values only), followed by a single
sentence summary. If nothing could be extracted, return an empty JSON array and explain why in the summary.
Dismiss cookie banners and pop-ups when they block the page. Never sign in, purchase, or submit personal data.
"""


class LLMConfigurationError(RuntimeError):
    pass


def build_llm(provider: Provider) -> tuple[BaseChatModel, str]:
    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise LLMConfigurationError("ANTHROPIC_API_KEY is not configured")
        return ChatAnthropic(model=settings.anthropic_model, api_key=settings.anthropic_api_key, temperature=0.2), settings.anthropic_model
    if not settings.gemini_api_key:
        raise LLMConfigurationError("GEMINI_API_KEY is not configured")
    thinking: dict[str, Any] = {}
    if settings.gemini_thinking_level in {"minimal", "low", "medium", "high"} and "gemini-2" not in settings.gemini_model:
        thinking["thinking_level"] = settings.gemini_thinking_level
    return ChatGoogle(model=settings.gemini_model, api_key=settings.gemini_api_key, temperature=0.2, retry_base_delay=3.0, **thinking), settings.gemini_model


def model_for(provider: Provider) -> str:
    return settings.anthropic_model if provider == "anthropic" else settings.gemini_model


def compose_task(mission: str, target_url: str | None) -> str:
    if target_url:
        return f"Start by opening {target_url}. Then: {mission}"
    return mission


def _actions_of(output: AgentOutput) -> list[ActionInfo]:
    actions: list[ActionInfo] = []
    for action in output.action:
        dumped: dict[str, Any] = action.model_dump(exclude_unset=True, exclude_none=True)
        for name, params in dumped.items():
            actions.append(ActionInfo(name=name, params=params if isinstance(params, dict) else {"value": params}))
    return actions


class LiveMission:
    def __init__(self, record: MissionRecord) -> None:
        self.record = record
        self.agent: Agent | None = None
        self._step_started: float = time.perf_counter()
        self._last_url: str | None = None
        self._frame_task: asyncio.Task[None] | None = None
        self._stopped = False
        self._cancel_requested = False
        self.reasoned_steps = 0

    async def _emit(self, **fields: Any) -> None:
        await hub.publish(AgentEvent(mission_id=self.record.mission_id, **fields))

    async def _tokens(self) -> int:
        if self.agent is None:
            return 0
        try:
            summary = await self.agent.token_cost_service.get_usage_summary()
            return int(summary.total_tokens)
        except Exception:
            return self.record.tokens

    async def on_step_start(self, agent: Agent) -> None:
        self._step_started = time.perf_counter()

    async def on_new_step(self, state: BrowserStateSummary, output: AgentOutput, step: int) -> None:
        self.reasoned_steps += 1
        self._last_url = state.url
        selector_map = getattr(state.dom_state, "selector_map", None) or {}
        await self._emit(
            type="phase",
            phase="PERCEIVE",
            step=step,
            url=state.url,
            title=state.title,
            dom_elements=len(selector_map),
            screenshot=state.screenshot,
            message=f"Captured DOM snapshot with {len(selector_map)} interactive elements on {state.title or state.url}",
        )
        reasoning = output.thinking or output.next_goal or ""
        await self._emit(
            type="phase",
            phase="REASON",
            step=step,
            url=state.url,
            thought=reasoning,
            evaluation=output.evaluation_previous_goal,
            memory=output.memory,
            next_goal=output.next_goal,
            latency_ms=round((time.perf_counter() - self._step_started) * 1000, 1),
        )
        actions = _actions_of(output)
        await self._emit(
            type="phase",
            phase="ACT",
            step=step,
            url=state.url,
            actions=actions,
            message=", ".join(a.name for a in actions) or "no-op",
        )

    async def on_step_end(self, agent: Agent) -> None:
        if not agent.history.history:
            return
        last = agent.history.history[-1]
        results = list(last.result) + [r for r in (agent.state.last_result or []) if r not in last.result]
        errors = list(dict.fromkeys(r.error for r in results if r.error))
        if last.model_output is None and not errors:
            errors = ["LLM produced no valid output for this step"]
        extracted = [r.extracted_content for r in results if r.extracted_content]
        done = any(r.is_done for r in results)
        tokens = await self._tokens()
        step = last.metadata.step_number if last.metadata else max(agent.state.n_steps - 1, 1)
        self.record.steps = len(agent.history.history)
        self.record.tokens = tokens
        latency = round((time.perf_counter() - self._step_started) * 1000, 1)
        await self._emit(
            type="phase",
            phase="VALIDATE",
            step=step,
            url=last.state.url if last.state else self._last_url,
            success=not errors,
            error="; ".join(errors)[:2000] if errors else None,
            message=(
                "Step failed validation" if errors
                else "Mission objective reported complete" if done
                else extracted[-1][:1500] if extracted
                else "Action results verified"
            ),
            latency_ms=latency,
            tokens=tokens,
        )
        await self._emit(type="metrics", step=step, tokens=tokens, latency_ms=latency)

    async def _stream_frames(self) -> None:
        while not self._stopped:
            await asyncio.sleep(FRAME_INTERVAL_SECONDS)
            agent = self.agent
            if agent is None or agent.browser_session is None:
                continue
            try:
                raw = await asyncio.wait_for(agent.browser_session.take_screenshot(format="jpeg", quality=55), timeout=4)
                url = await agent.browser_session.get_current_page_url()
            except Exception:
                continue
            await self._emit(type="frame", screenshot=base64.b64encode(raw).decode("ascii"), url=url)

    def stop(self) -> None:
        self._cancel_requested = True
        self._stopped = True
        if self.agent is not None:
            self.agent.stop()

    async def run(self) -> MissionRecord:
        llm, model = build_llm(self.record.provider)
        directory = mission_dir(self.record.mission_id)
        profile = BrowserProfile(
            headless=settings.headless,
            record_video_dir=directory / "artifacts",
            window_size={"width": 1366, "height": 860},
            highlight_elements=True,
            keep_alive=False,
        )
        self.agent = Agent(
            task=compose_task(self.record.mission, self.record.target_url),
            llm=llm,
            browser_profile=profile,
            register_new_step_callback=self.on_new_step,
            extend_system_message=OUTPUT_CONTRACT,
            file_system_path=str(directory / "artifacts"),
            use_judge=False,
            enable_signal_handler=False,
            llm_timeout=settings.llm_timeout,
            step_timeout=settings.llm_timeout + 60,
        )
        self.record.model = model
        self.record.status = "running"
        await save_record(self.record)
        await self._emit(
            type="mission_started",
            message=f"Live autonomous execution with {model} ({'headless' if settings.headless else 'visible'} Chromium)",
            data=self.record.model_dump(),
        )
        self._frame_task = asyncio.create_task(self._stream_frames())
        try:
            history = await self.agent.run(
                max_steps=self.record.max_steps,
                on_step_start=self.on_step_start,
                on_step_end=self.on_step_end,
            )
        finally:
            self._stopped = True
            if self._frame_task:
                self._frame_task.cancel()
            try:
                await self.agent.close()
            except Exception:
                logger.debug("Agent close raised", exc_info=True)

        final = history.final_result()
        records = extract_records(final)
        if not records:
            for chunk in reversed(history.extracted_content()):
                records = extract_records(chunk)
                if records:
                    break
        await write_json(directory / "history.json", history.model_dump())
        self.record.final_result = final
        self.record.records = records
        self.record.steps = history.number_of_steps()
        self.record.tokens = history.usage.total_tokens if history.usage else self.record.tokens
        self.record.has_csv = await save_structured_data(self.record.mission_id, records, final)
        await asyncio.sleep(0.5)
        self.record.has_recording = finalize_recording(self.record.mission_id)
        successful = history.is_successful()
        if self._cancel_requested and not history.is_done():
            self.record.status = "cancelled"
        else:
            self.record.status = "complete" if history.is_done() and successful is not False else "failed"
        if self.record.status == "failed":
            errs = [e for e in history.errors() if e]
            if history.is_done() and final:
                summary = final.split("```")[-1].strip() or final
                self.record.error = f"Agent reported the objective as not achieved: {summary[:600]}"
                if errs:
                    self.record.error += f" (last error: {errs[-1][:300]})"
            else:
                self.record.error = errs[-1][:2000] if errs else "Agent did not reach the objective within the step budget"
        return self.record
