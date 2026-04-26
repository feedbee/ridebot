# Agent Execution Rules

## Agent Documentation Index

- Start with [`docs/README.md`](docs/README.md) for an index of project documentation intended for agents and contributors.
- Architecture and layer boundaries are defined in [`docs/layer-responsibilities.md`](docs/layer-responsibilities.md).
- Coding preferences and local implementation constraints are documented in [`docs/coding-preferences.md`](docs/coding-preferences.md).
- Testing strategy and test-layer expectations are defined in [`docs/testing-conventions.md`](docs/testing-conventions.md).
- When a task references a planned feature, refactor, or change design, check the relevant specification in [`docs/changes/`](docs/changes) for historical context only. Documents in `docs/changes/` are immutable after the related change lands and must not be edited to reflect later behavior; update living documentation elsewhere instead.

## Architecture And Layering

- Command handlers are Telegram-facing entry points. They should validate command-specific conditions, prepare input for services, and handle user-facing replies.
- Reusable business rules and side effects do not belong in command handlers. Put them in the service layer or another appropriate non-Telegram abstraction.
- Follow [`docs/layer-responsibilities.md`](docs/layer-responsibilities.md) when deciding whether code belongs in commands, services, the Telegram boundary, formatters, wizards, or utilities.

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

## Coding Preferences

- Follow [`docs/coding-preferences.md`](docs/coding-preferences.md) for local coding style and change-scope preferences.
- Prefer simple solutions, reuse existing patterns, and avoid duplication.
- Keep changes narrowly focused on the task and think through adjacent code paths that may be affected.

## Notes

- If already running inside a container (`/.dockerenv` exists), commands run directly without nested `docker exec`.
- Optional override:
  - Set `DEVCONTAINER_ID=<id>` to force a specific container.
