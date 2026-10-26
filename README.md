<div align="center">

  ## 🌐 Watch Live Demo (1m 35s)

  <a href="https://www.youtube.com/watch?v=XUK7UIzj-vI" target="_blank">
    <img src="https://img.youtube.com/vi/XUK7UIzj-vI/maxresdefault.jpg" alt="GhostOperator Autonomous Agent Demo" width="100%" />
  </a>

  <br/><br/>

  [![Watch on YouTube](https://img.shields.io/badge/YouTube-Watch%20Demo%20in%20Action-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/watch?v=XUK7UIzj-vI)

  <p><sub>▶️ <em>Click the image above to watch GhostOperator executing live e-commerce purchases, UI interactions, and deep extraction.</em></sub></p>

</div>







# ⚡ # GhostOperator an Autonomous Web Agent

🌐 **Demo** https://youtu.be/XUK7UIzj-vI?si=wb5gvHSkHvOUIDMm

# GhostOperator
An autonomous browser agent. Give it an objective. It opens a real Chromium and loops through a
**PERCEIVE → REASON → ACT → VALIDATE** cycle, streaming every phase to a live dashboard over
WebSockets. When it finishes, it saves structured data (JSON and CSV) and a video recording.

```
ghost-operator/
├── .env / .env.example      configuration (API keys, models, headless flag)
├── start.bat / run.ps1      Windows launchers (bootstrap + run both services)
├── start.sh                 Linux/macOS launcher
├── backend/                 FastAPI + browser-use + Playwright
│   ├── main.py              REST + WebSocket API, mission manager, demo fallback
│   ├── app/live_agent.py    browser-use Agent wiring and phase streaming
│   ├── app/demo_agent.py    simulated missions (no keys / forced demo)
│   ├── app/storage.py       artifacts: mission.json, history.json, data.json, data.csv, recording.mp4
│   └── storage/missions/{mission_id}/
└── frontend/                React 19 + Vite + Tailwind 4 + Framer Motion + Lucide
```

## Quick start

1. Put your key in `.env`: `GEMINI_API_KEY=...` (free tier from https://aistudio.google.com/apikey).
2. Run the launcher for your OS:
   - Windows: double-click `start.bat`, or run `powershell -ExecutionPolicy Bypass -File run.ps1`
   - Linux/macOS: `./start.sh`
3. Open http://localhost:5173. The launcher opens it for you.

On first run, the launcher creates `backend/.venv`, installs `requirements.txt`, runs
`playwright install chromium` and `npm install`. Later runs start in a few seconds.

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | — | Primary provider (Gemini). |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Google no longer serves `gemini-2.5-flash` to new API users. |
| `GEMINI_THINKING_LEVEL` | `low` | Keeps per-step latency down on heavy pages. |
| `ANTHROPIC_API_KEY` | — | Optional secondary provider. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Claude 3.5 Sonnet is retired, so the current Sonnet is the default. |
| `HEADLESS_BROWSER` | `false` | `false` shows the real browser window. Either way, frames stream to the UI. |
| `LLM_TIMEOUT_SECONDS` | `150` | Per-call LLM timeout. |
| `FORCE_DEMO_MODE` | `false` | Always run simulated missions. |
| `PORT` | `8000` | Backend port. |
| `VITE_API_URL` | `http://localhost:8000` | In dev, the Vite proxy forwards `/api` and `/ws`. |

## API

- `POST /api/run-mission`: `{ mission, max_steps, target_url, model_provider: "gemini" | "anthropic", demo_mode? }` returns `mission_id`
- `WS /ws/agent` (optional `?mission_id=`): event stream of `mission_started`, `phase` (with `phase`, `url`, `thought`, `actions`, `screenshot`), `frame`, `metrics`, `log`, `mission_complete`, `mission_failed`
- `POST /api/missions/{id}/stop` · `GET /api/missions` · `GET /api/missions/{id}`
- `GET /api/missions/{id}/data.csv` · `/data.json` · `/recording`
- `GET /api/health`: provider readiness

## Demo fallback

If the selected provider has no key, the backend runs a scripted mission so the timeline, viewport
and data grid can still be shown. This also happens when the provider rejects the first call
(invalid key, model not found, quota exhausted). Simulated runs are labelled everywhere: header
badge, viewport, a banner above the data grid, and `source: "simulated"` on every row.

## Notes

- Built on **browser-use 0.13**, which ships its own LLM adapters (`ChatGoogle`, `ChatAnthropic`) and
  no longer accepts LangChain chat models directly. The `langchain-*` packages remain in
  `requirements.txt` as requested, but the agent uses the native adapters.
- Gemini's free tier has tight per-minute and per-day quotas, and the model sometimes returns
  `503 high demand`. The client retries with backoff. If you hit `429 RESOURCE_EXHAUSTED`, wait for the
  quota to reset or use a paid key.
- Some sites (Kayak in particular) run aggressive bot detection, so results vary between runs.
