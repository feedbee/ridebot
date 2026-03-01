#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="${script_dir}"
devcontainer_exec="${script_dir}/scripts/devcontainer-exec.sh"

usage() {
  cat <<'USAGE'
Usage: ./run-tests.sh [--mode <basic|mongo|all>] [--coverage]

Options:
  -m, --mode      Test mode to run. Default: all
  -c, --coverage  Enable coverage for selected mode
  -h, --help      Show this help message
USAGE
}

mode="all"
coverage="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--mode)
      if [[ $# -lt 2 ]]; then
        echo "Error: --mode requires a value" >&2
        usage
        exit 1
      fi
      mode="$2"
      shift 2
      ;;
    --mode=*)
      mode="${1#*=}"
      shift
      ;;
    -c|--coverage)
      coverage="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    basic|mongo|all)
      mode="$1"
      shift
      ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      usage
      exit 1
      ;;
  esac
done

case "${mode}" in
  basic|mongo|all)
    ;;
  *)
    echo "Error: invalid mode '${mode}'. Use basic, mongo, or all." >&2
    usage
    exit 1
    ;;
esac

if [[ "${coverage}" == "true" ]]; then
  case "${mode}" in
    basic)
      test_cmd=(npm run test:coverage:basic)
      ;;
    mongo)
      test_cmd=(npm run test:coverage -- --runInBand src/__tests__/storage/mongodb-storage.test.js)
      ;;
    all)
      test_cmd=(npm run test:coverage)
      ;;
  esac
else
  case "${mode}" in
    basic)
      test_cmd=(npm run test:basic)
      ;;
    mongo)
      test_cmd=(npm run test:mongo)
      ;;
    all)
      test_cmd=(npm test)
      ;;
  esac
fi

docker_available() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi

  docker ps >/dev/null 2>&1
}

# 1) If already inside any container, run tests directly.
if [[ -f "/.dockerenv" ]]; then
  exec "${test_cmd[@]}"
fi

# 2) If Docker is unavailable, run tests locally on host.
if ! docker_available; then
  exec "${test_cmd[@]}"
fi

# 3) If a devcontainer for this repo is running, run tests there.
container_id="$("${devcontainer_exec}" --find-container-id 2>/dev/null || true)"
if [[ -n "${container_id}" ]]; then
  exec "${devcontainer_exec}" "${test_cmd[@]}"
fi

# 4) No devcontainer: run tests in a fresh disposable container (legacy behavior).
cmd_string="$(printf '%q ' "${test_cmd[@]}")"
exec docker run --rm -i \
  -v "${repo_root}:/app" \
  -w /app \
  node:latest \
  sh -c "npm install && ${cmd_string}"
