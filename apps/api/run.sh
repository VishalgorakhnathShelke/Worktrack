#!/usr/bin/env bash

set -Eeuo pipefail

API_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${API_DIR}/../.." && pwd)"

find_python() {
  local candidate
  for candidate in \
    "${REPO_ROOT}/.venv/bin/python" \
    "${REPO_ROOT}/apps/.venv/bin/python" \
    "${REPO_ROOT}/.venv/Scripts/python.exe" \
    "${REPO_ROOT}/apps/.venv/Scripts/python.exe"; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return
    fi
  done

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi

  if command -v python >/dev/null 2>&1; then
    command -v python
    return
  fi

  echo "Python was not found. Create the repository virtual environment first." >&2
  exit 1
}

PYTHON="${WORKTRACE_PYTHON:-$(find_python)}"
HOST="${WORKTRACE_API_HOST:-127.0.0.1}"
PORT="${WORKTRACE_API_PORT:-8000}"
RELOAD="${WORKTRACE_API_RELOAD:-true}"

cd "${REPO_ROOT}"

UVICORN_ARGS=(
  "worktrace_api.main:app"
  "--app-dir" "${API_DIR}/src"
  "--host" "${HOST}"
  "--port" "${PORT}"
)

if [[ "${RELOAD}" == "true" ]]; then
  UVICORN_ARGS+=("--reload" "--reload-dir" "${API_DIR}/src")
fi

exec "${PYTHON}" -m uvicorn "${UVICORN_ARGS[@]}" "$@"
