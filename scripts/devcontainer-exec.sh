#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

find_container_id() {
  local id="${DEVCONTAINER_ID:-}"

  if [[ -n "${id}" ]]; then
    printf '%s\n' "${id}"
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi

  if ! id="$(docker ps \
    --filter "label=devcontainer.local_folder=${repo_root}" \
    --format '{{.ID}}' 2>/dev/null | head -n 1)"; then
    return 1
  fi

  if [[ -z "${id}" ]]; then
    return 1
  fi

  printf '%s\n' "${id}"
}

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage:
  devcontainer-exec.sh <command> [args...]
  devcontainer-exec.sh --find-container-id

Behavior:
  - If already inside a container, executes command directly.
  - Otherwise executes in matching running devcontainer (/workspace) when found.
  - Falls back to host execution when no devcontainer is running.
EOF
  exit 0
fi

if [[ "${1:-}" == "--find-container-id" ]]; then
  find_container_id
  exit $?
fi

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 2
fi

if [[ -f "/.dockerenv" ]]; then
  exec "$@"
fi

container_id="$(find_container_id || true)"

if [[ -z "${container_id}" ]]; then
  echo "No running devcontainer found for ${repo_root}. Running on host." >&2
  exec "$@"
fi

exec docker exec -w /workspace "${container_id}" "$@"
