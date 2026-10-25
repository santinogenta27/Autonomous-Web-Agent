"""Demo fallback: a scripted mission that exercises the full event pipeline without an LLM or browser.

Every event and every record produced here is flagged `simulated=True` and the data rows carry
`source: "simulated"` so the dashboard can never present sample output as real scraped data.
"""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from .hub import hub
from .schemas import ActionInfo, AgentEvent, MissionRecord
from .storage import mission_dir, save_record, save_structured_data, write_json


@dataclass
class DemoStep:
    url: str
    title: str
    scene: str
    thought: str
    next_goal: str
    actions: list[ActionInfo]
    validation: str
    dom_elements: int
    highlight: str | None = None
    typed: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def _next_friday(today: date | None = None) -> date:
    today = today or date.today()
    delta = (4 - today.weekday()) % 7 or 7
    return today + timedelta(days=delta)


def _flight_script() -> tuple[list[DemoStep], list[dict[str, Any]]]:
    friday = _next_friday().isoformat()
    url = f"https://www.kayak.com/flights/MIA-EWR/{friday}?sort=price_a"
    steps = [
        DemoStep("https://www.kayak.com/flights", "KAYAK Flights", "search",
                 "The objective needs one-way fares MIA→EWR next Friday. Kayak's flight search form is the entry point.",
                 "Fill origin airport field with MIA",
                 [ActionInfo(name="input_text", params={"index": 14, "text": "MIA"})],
                 "Origin field now shows 'Miami (MIA)'", 212, highlight="origin", typed="MIA"),
        DemoStep("https://www.kayak.com/flights", "KAYAK Flights", "search",
                 "Origin set. Destination must be Newark Liberty, not JFK/LGA, so I will select the EWR suggestion explicitly.",
                 "Set destination EWR and the departure date",
                 [ActionInfo(name="input_text", params={"index": 18, "text": "EWR"}),
                  ActionInfo(name="click", params={"index": 31})],
                 f"Destination 'Newark (EWR)' locked, date picker set to {friday}", 236, highlight="destination", typed="EWR"),
        DemoStep(url, "MIA to EWR | KAYAK", "loading",
                 "Search submitted. Results stream in progressively; I should wait for the price-sorted list to stabilise.",
                 "Wait for results and sort by cheapest",
                 [ActionInfo(name="wait", params={"seconds": 3}),
                  ActionInfo(name="click", params={"index": 57})],
                 "Results sorted by price ascending, 148 itineraries loaded", 488, highlight="sort"),
        DemoStep(url, "MIA to EWR | KAYAK", "results",
                 "The top of the list contains the cheapest itineraries. Scroll once to make sure the first five cards are fully rendered.",
                 "Scroll the result list",
                 [ActionInfo(name="scroll", params={"down": True, "num_pages": 1.0})],
                 "Five complete result cards visible with airline, stops and price", 512, highlight="results"),
        DemoStep(url, "MIA to EWR | KAYAK", "extract",
                 "All needed fields are visible. Extract airline, departure/arrival, stops and price for the five cheapest cards.",
                 "Extract structured flight data",
                 [ActionInfo(name="extract", params={"query": "top 5 cheapest flights: airline, times, stops, price"})],
                 "Extracted 5 rows, schema validated", 512, highlight="results"),
        DemoStep(url, "MIA to EWR | KAYAK", "done",
                 "Data is complete and consistent. Export as CSV and finish the mission.",
                 "Report results",
                 [ActionInfo(name="done", params={"success": True})],
                 "Mission objective satisfied", 512),
    ]
    airlines = [("Spirit", "Nonstop"), ("Frontier", "Nonstop"), ("JetBlue", "Nonstop"),
                ("American", "Nonstop"), ("United", "1 stop (IAH)")]
    base = random.randint(58, 74)
    rows = []
    for i, (airline, stops) in enumerate(airlines):
        hour = 6 + i * 2
        rows.append({
            "rank": i + 1, "airline": airline, "date": friday, "depart": f"{hour:02d}:{random.choice(['05', '20', '45'])}",
            "arrive": f"{hour + (3 if 'Nonstop' in stops else 6):02d}:{random.choice(['10', '35', '55'])}",
            "stops": stops, "price_usd": base + i * random.randint(9, 22), "source": "simulated",
        })
    return steps, rows


def _pricing_script() -> tuple[list[DemoStep], list[dict[str, Any]]]:
    url = "https://www.nike.com/w/mens-running-shoes?q=running%20shoes"
    steps = [
        DemoStep("https://www.nike.com", "Nike. Just Do It.", "search",
                 "Start on nike.com. A geo/cookie modal is likely; dismiss it before using search.",
                 "Dismiss modal and open search",
                 [ActionInfo(name="click", params={"index": 4}), ActionInfo(name="click", params={"index": 9})],
                 "Modal closed, search box focused", 164, highlight="search"),
        DemoStep("https://www.nike.com", "Nike. Just Do It.", "search",
                 "Query the catalogue for running shoes.",
                 "Type 'running shoes' and submit",
                 [ActionInfo(name="input_text", params={"index": 9, "text": "running shoes"}),
                  ActionInfo(name="send_keys", params={"keys": "Enter"})],
                 "Search results page loaded", 171, typed="running shoes", highlight="search"),
        DemoStep(url, "Running Shoes. Nike.com", "loading",
                 "Apply the price filter so only models under $150 remain.",
                 "Open price filter and select $100 - $150",
                 [ActionInfo(name="click", params={"index": 42}), ActionInfo(name="click", params={"index": 47})],
                 "Filter 'Under $150' applied, 63 products", 402, highlight="sort"),
        DemoStep(url + "&price=0-150", "Running Shoes Under $150. Nike.com", "results",
                 "Product grid is filtered. Capture the first four tiles including availability badges.",
                 "Extract top 4 models",
                 [ActionInfo(name="extract", params={"query": "first 4 products: model, price, stock status"})],
                 "Extracted 4 product rows", 418, highlight="results"),
        DemoStep(url + "&price=0-150", "Running Shoes Under $150. Nike.com", "done",
                 "All four rows have model, price and stock status. Finish.",
                 "Report results", [ActionInfo(name="done", params={"success": True})],
                 "Mission objective satisfied", 418),
    ]
    models = [("Pegasus 41", 140), ("Winflo 11", 105), ("Revolution 7", 75), ("Downshifter 13", 80)]
    rows = [{"rank": i + 1, "model": m, "price_usd": p, "stock_status": random.choice(["In stock", "In stock", "Low stock"]),
             "source": "simulated"} for i, (m, p) in enumerate(models)]
    return steps, rows


def _leads_script() -> tuple[list[DemoStep], list[dict[str, Any]]]:
    url = "https://www.ycombinator.com/companies?batch=W24&industry=Artificial%20Intelligence"
    steps = [
        DemoStep("https://www.ycombinator.com/companies", "The YC Startup Directory", "search",
                 "The directory supports batch and industry filters; using them is more reliable than free-text search.",
                 "Filter batch W24", [ActionInfo(name="click", params={"index": 22})],
                 "Batch filter W24 active", 188, highlight="sort"),
        DemoStep(url, "The YC Startup Directory", "results",
                 "Add industry = Artificial Intelligence and confirm the list updates.",
                 "Filter industry AI", [ActionInfo(name="click", params={"index": 35})],
                 "Filtered list shows W24 AI companies", 344, highlight="results"),
        DemoStep(url, "The YC Startup Directory", "results",
                 "Open the first three company profiles to read founder names, which are not on the list cards.",
                 "Open company profiles", [ActionInfo(name="click", params={"index": 61}),
                                           ActionInfo(name="go_back", params={})],
                 "Founder data captured for 3 profiles", 290, highlight="results"),
        DemoStep(url, "The YC Startup Directory", "extract",
                 "Combine card one-liners with founder names into a lead table.",
                 "Extract lead records", [ActionInfo(name="extract", params={"query": "name, founders, one-line pitch"})],
                 "Extracted 3 lead rows", 344, highlight="results"),
        DemoStep(url, "The YC Startup Directory", "done",
                 "Lead list complete.", "Report results", [ActionInfo(name="done", params={"success": True})],
                 "Mission objective satisfied", 344),
    ]
    rows = [
        {"company": "Sample Co. Alpha", "founders": "Founder A; Founder B", "pitch": "Placeholder pitch for demo mode", "batch": "W24", "source": "simulated"},
        {"company": "Sample Co. Beta", "founders": "Founder C", "pitch": "Placeholder pitch for demo mode", "batch": "W24", "source": "simulated"},
        {"company": "Sample Co. Gamma", "founders": "Founder D; Founder E", "pitch": "Placeholder pitch for demo mode", "batch": "W24", "source": "simulated"},
    ]
    return steps, rows


def _generic_script(mission: str, target_url: str | None) -> tuple[list[DemoStep], list[dict[str, Any]]]:
    url = target_url or "https://duckduckgo.com/?q=" + "+".join(mission.split()[:6])
    steps = [
        DemoStep(url, "Search", "search", f"Break down the objective: “{mission[:140]}”. Begin with a search.",
                 "Navigate and search", [ActionInfo(name="navigate", params={"url": url})],
                 "Page loaded", 120, highlight="search"),
        DemoStep(url, "Results", "results", "Scan the results and open the most relevant source.",
                 "Open best result", [ActionInfo(name="click", params={"index": 12})], "Target page opened", 260, highlight="results"),
        DemoStep(url, "Results", "extract", "Extract the requested facts into rows.",
                 "Extract data", [ActionInfo(name="extract", params={"query": mission[:120]})], "Extracted 3 rows", 260),
        DemoStep(url, "Results", "done", "Objective satisfied.", "Report results",
                 [ActionInfo(name="done", params={"success": True})], "Mission objective satisfied", 260),
    ]
    rows = [{"item": f"Sample result {i}", "detail": "Demo mode placeholder", "source": "simulated"} for i in range(1, 4)]
    return steps, rows


def pick_script(mission: str, target_url: str | None) -> tuple[list[DemoStep], list[dict[str, Any]]]:
    text = f"{mission} {target_url or ''}".lower()
    if "kayak" in text or "flight" in text:
        return _flight_script()
    if "nike" in text or "shoe" in text:
        return _pricing_script()
    if "ycombinator" in text or "yc " in text or "startup" in text:
        return _leads_script()
    return _generic_script(mission, target_url)


class DemoMission:
    def __init__(self, record: MissionRecord, reason: str) -> None:
        self.record = record
        self.reason = reason
        self._stopped = False

    def stop(self) -> None:
        self._stopped = True

    async def _emit(self, **fields: Any) -> None:
        await hub.publish(AgentEvent(mission_id=self.record.mission_id, simulated=True, **fields))

    async def _pause(self, low: float, high: float) -> None:
        await asyncio.sleep(random.uniform(low, high))

    async def run(self) -> MissionRecord:
        steps, rows = pick_script(self.record.mission, self.record.target_url)
        steps = steps[: self.record.max_steps]
        self.record.status = "running"
        await save_record(self.record)
        await self._emit(type="mission_started", message=f"DEMO MODE — {self.reason}. Browser and data are simulated.",
                         data=self.record.model_dump())
        tokens = 0
        for index, step in enumerate(steps, start=1):
            if self._stopped:
                self.record.status = "cancelled"
                break
            scene = {"scene": step.scene, "highlight": step.highlight, "typed": step.typed, "rows": rows if step.scene in {"extract", "done"} else None}
            await self._emit(type="phase", phase="PERCEIVE", step=index, url=step.url, title=step.title,
                             dom_elements=step.dom_elements, data=scene,
                             message=f"Captured DOM snapshot with {step.dom_elements} interactive elements on {step.title}")
            await self._pause(0.6, 1.1)
            latency = round(random.uniform(700, 1900), 1)
            tokens += random.randint(2400, 5200)
            await self._emit(type="phase", phase="REASON", step=index, url=step.url, thought=step.thought,
                             next_goal=step.next_goal, evaluation="Previous action succeeded" if index > 1 else "Starting mission",
                             latency_ms=latency, tokens=tokens)
            await self._pause(0.5, 0.9)
            await self._emit(type="phase", phase="ACT", step=index, url=step.url, actions=step.actions, data=scene,
                             message=", ".join(a.name for a in step.actions))
            await self._pause(0.7, 1.3)
            await self._emit(type="phase", phase="VALIDATE", step=index, url=step.url, success=True,
                             message=step.validation, latency_ms=latency, tokens=tokens)
            await self._emit(type="metrics", step=index, tokens=tokens, latency_ms=latency)
            self.record.steps = index
            self.record.tokens = tokens
            await self._pause(0.3, 0.6)

        directory = mission_dir(self.record.mission_id)
        if self.record.status != "cancelled":
            self.record.status = "complete"
            self.record.records = rows
            self.record.final_result = f"[SIMULATED] Demo mission produced {len(rows)} sample rows. Configure an API key for live execution."
            self.record.has_csv = await save_structured_data(self.record.mission_id, rows, self.record.final_result)
        await write_json(directory / "history.json", {"simulated": True, "steps": [s.__dict__ | {"actions": [a.model_dump() for a in s.actions]} for s in steps]})
        return self.record
