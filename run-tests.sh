#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="${script_dir}"
devcontainer_exec="${script_dir}/scripts/devcontainer-exec.sh"

docker_available() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi

  docker ps >/dev/null 2>&1
}

# 1) If already inside any container, run tests directly.
if [[ -f "/.dockerenv" ]]; then
  exec npm test
fi

# 2) If Docker is unavailable, run tests locally on host.
if ! docker_available; then
  exec npm test
fi

# 3) If a devcontainer for this repo is running, run tests there.
container_id="$("${devcontainer_exec}" --find-container-id 2>/dev/null || true)"
if [[ -n "${container_id}" ]]; then
  exec "${devcontainer_exec}" npm test
fi

# 4) No devcontainer: run tests in a fresh disposable container (legacy behavior).
exec docker run --rm -i \
  -v "${repo_root}:/app" \
  -w /app \
  node:latest \
  sh -c "npm install && npm test"
