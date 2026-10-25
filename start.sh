#!/usr/bin/env bash
# GhostOperator launcher for Linux/macOS: bootstraps dependencies, then runs backend + frontend.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
PY="$VENV/bin/python"

printf '\n  \033[32mGhostOperator // AetherBrowser\033[0m\n\n'

if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "[setup] Created .env from .env.example. Add your GEMINI_API_KEY for live missions."
fi

if [ ! -x "$PY" ]; then
  PYTHON_BIN=""
  for candidate in python3.13 python3.12 python3.11 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
      PYTHON_BIN="$candidate"; break
    fi
  done
  if [ -z "$PYTHON_BIN" ]; then echo "Python 3.11+ is required." >&2; exit 1; fi
  echo "[setup] Creating virtual environment with $PYTHON_BIN"
  "$PYTHON_BIN" -m venv "$VENV"
fi

STAMP="$VENV/.deps-installed"
if [ ! -f "$STAMP" ] || [ "$BACKEND/requirements.txt" -nt "$STAMP" ]; then
  echo "[setup] Installing backend dependencies..."
  "$PY" -m pip install --upgrade pip
  "$PY" -m pip install -r "$BACKEND/requirements.txt"
  echo "[setup] Installing Playwright Chromium..."
  "$PY" -m playwright install chromium || "$PY" -m playwright install --with-deps chromium
  date > "$STAMP"
fi

if [ ! -d "$FRONTEND/node_modules" ]; then
  command -v npm >/dev/null 2>&1 || { echo "Node.js 18+ is required." >&2; exit 1; }
  echo "[setup] Installing frontend dependencies..."
  (cd "$FRONTEND" && npm install)
fi

cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Stopping GhostOperator..."
  kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "[run] Backend  -> http://localhost:8000"
(cd "$BACKEND" && exec "$PY" main.py) &
BACKEND_PID=$!

echo "[run] Frontend -> http://localhost:5173"
(cd "$FRONTEND" && exec npm run dev) &
FRONTEND_PID=$!

sleep 4
if command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:5173 >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then open http://localhost:5173 || true
fi

wait -n "$BACKEND_PID" "$FRONTEND_PID"
