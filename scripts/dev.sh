#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
if [[ ! -x backend/.venv/bin/python ]]; then
  echo 'Set up backend/.venv first; see README.md.' >&2
  exit 1
fi
if [[ ! -d frontend/node_modules ]]; then
  echo 'Run npm ci in frontend first; see README.md.' >&2
  exit 1
fi
cleanup() {
  kill "${backend_pid:-}" "${frontend_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
(cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload) &
backend_pid=$!
(cd frontend && npm run dev -- --host 127.0.0.1) &
frontend_pid=$!
wait
