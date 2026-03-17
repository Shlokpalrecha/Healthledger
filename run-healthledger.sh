#!/bin/zsh

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_NODE="$ROOT_DIR/.local/node-v22.14.0-darwin-arm64/bin"

export PATH="$LOCAL_NODE:$PATH"

echo "Starting HealthLedger AI backend on http://127.0.0.1:8000"
cd "$ROOT_DIR/backend"
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

echo "Starting HealthLedger AI frontend on http://127.0.0.1:5173"
cd "$ROOT_DIR/frontend"
npm run dev -- --host 127.0.0.1 --port 5173