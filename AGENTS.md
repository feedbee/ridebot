# Agent Execution Rules

## Devcontainer-first command execution

- If a VS Code devcontainer for this repo is running, execute commands in that container.
- Do not hardcode container IDs. They change after restarts.
- Use `scripts/devcontainer-exec.sh` to run commands. It automatically:
  - Detects the devcontainer by Docker label `devcontainer.local_folder=<repo_root>`
  - Runs inside container `/workspace` when found
  - Falls back to host execution when no matching container is running
- For detection-only flows, use:
  - `./scripts/devcontainer-exec.sh --find-container-id`
  - Prints container ID when found and exits non-zero when not found.

## Test command

- Standard test entrypoint:
  - `./run-tests.sh --mode basic`
- Always run only basic tests by default (no Mongo mode), because Mongo-based runs may hang.
- Do not run `--mode mongo` unless the user explicitly asks for it.
- Follow the project testing strategy in `docs/testing-conventions.md` when adding, updating, or reviewing tests.

## Notes

- If already running inside a container (`/.dockerenv` exists), commands run directly without nested `docker exec`.
- Optional override:
  - Set `DEVCONTAINER_ID=<id>` to force a specific container.
