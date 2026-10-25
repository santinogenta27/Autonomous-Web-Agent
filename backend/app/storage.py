"""Persistence of mission artifacts: metadata, history, structured data and recordings."""

from __future__ import annotations

import csv
import io
import json
import re
from pathlib import Path
from typing import Any

import aiofiles

from .config import settings
from .schemas import MissionRecord


def mission_dir(mission_id: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,64}", mission_id):
        raise ValueError("Invalid mission id")
    path = settings.storage_dir / mission_id
    path.mkdir(parents=True, exist_ok=True)
    (path / "artifacts").mkdir(exist_ok=True)
    return path


async def write_json(path: Path, payload: Any) -> None:
    async with aiofiles.open(path, "w", encoding="utf-8") as handle:
        await handle.write(json.dumps(payload, indent=2, ensure_ascii=False, default=str))


async def save_record(record: MissionRecord) -> None:
    await write_json(mission_dir(record.mission_id) / "mission.json", record.model_dump())


def load_record(mission_id: str) -> MissionRecord | None:
    path = settings.storage_dir / mission_id / "mission.json"
    if not path.exists():
        return None
    return MissionRecord.model_validate_json(path.read_text(encoding="utf-8"))


def list_records(limit: int = 50) -> list[MissionRecord]:
    records: list[MissionRecord] = []
    for meta in settings.storage_dir.glob("*/mission.json"):
        try:
            records.append(MissionRecord.model_validate_json(meta.read_text(encoding="utf-8")))
        except ValueError:
            continue
    records.sort(key=lambda r: r.created_at, reverse=True)
    return records[:limit]


def records_to_csv(records: list[dict[str, Any]]) -> str:
    columns: list[str] = []
    for row in records:
        for key in row:
            if key not in columns:
                columns.append(key)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in records:
        writer.writerow({k: _flatten(v) for k, v in row.items()})
    return buffer.getvalue()


def _flatten(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        return "; ".join(_flatten(v) for v in value)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return "" if value is None else str(value)


async def save_structured_data(mission_id: str, records: list[dict[str, Any]], final_result: str | None) -> bool:
    directory = mission_dir(mission_id)
    await write_json(directory / "data.json", {"records": records, "final_result": final_result})
    if not records:
        return False
    async with aiofiles.open(directory / "data.csv", "w", encoding="utf-8", newline="") as handle:
        await handle.write(records_to_csv(records))
    return True


def finalize_recording(mission_id: str) -> bool:
    directory = mission_dir(mission_id)
    target = directory / "recording.mp4"
    if target.exists():
        return True
    candidates = sorted(
        (p for p in directory.rglob("*") if p.suffix.lower() in {".mp4", ".webm"} and p.stat().st_size > 0),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        return False
    newest = candidates[0]
    newest.replace(directory / f"recording{newest.suffix.lower()}")
    return True


def recording_path(mission_id: str) -> Path | None:
    directory = settings.storage_dir / mission_id
    for name in ("recording.mp4", "recording.webm"):
        candidate = directory / name
        if candidate.exists():
            return candidate
    return None


JSON_BLOCK = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def extract_records(text: str | None) -> list[dict[str, Any]]:
    """Pull a list of row-objects out of an LLM final answer, tolerating prose and code fences."""
    if not text:
        return []
    candidates: list[str] = [m.group(1) for m in JSON_BLOCK.finditer(text)]
    candidates.append(text)
    for opener, closer in (("[", "]"), ("{", "}")):
        start, end = text.find(opener), text.rfind(closer)
        if 0 <= start < end:
            candidates.append(text[start : end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate.strip())
        except (json.JSONDecodeError, ValueError):
            continue
        rows = _normalize(parsed)
        if rows:
            return rows
    return []


def _normalize(parsed: Any) -> list[dict[str, Any]]:
    if isinstance(parsed, list):
        rows = [item for item in parsed if isinstance(item, dict)]
        if rows:
            return rows
        return [{"value": item} for item in parsed] if parsed else []
    if isinstance(parsed, dict):
        for key in ("records", "results", "data", "items", "rows", "flights", "products", "companies"):
            if isinstance(parsed.get(key), list):
                return _normalize(parsed[key])
        for value in parsed.values():
            if isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
                return value
        return [parsed]
    return []
