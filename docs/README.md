# Documentation Index

This directory contains the project documents that agents and contributors should consult before making non-trivial changes.

## Core Guidance

- [`coding-preferences.md`](./coding-preferences.md)
  - Captures project coding preferences and implementation constraints in an agent-friendly form.
- [`layer-responsibilities.md`](./layer-responsibilities.md)
  - Defines what belongs in command handlers, services, the Telegram boundary, and utility/helper layers.
- [`testing-conventions.md`](./testing-conventions.md)
  - Defines the testing strategy, test layering, and expectations for new and changed behavior.
- [`changelog.md`](./changelog.md)
  - Product-facing release history grouped by version, using Git tag creation dates.

## Specifications And Change Design

- [`changes/`](./changes)
  - Historical feature specifications, refactoring plans, and design notes for individual changes.
  - Documents in this directory are immutable after the related change lands: do not edit them to match later behavior.
  - When a task references an existing feature, bug, or refactor plan, check for a matching document here as historical context only. If the current implementation differs, prefer the current code and update living documentation outside `changes/` when needed.

## Recommended Reading Order For Agents

1. Read [`layer-responsibilities.md`](./layer-responsibilities.md) to understand architectural boundaries.
2. Read [`coding-preferences.md`](./coding-preferences.md) to align with local implementation style and constraints.
3. Read [`testing-conventions.md`](./testing-conventions.md) before adding or changing tests.
4. Read the relevant document in [`changes/`](./changes) as historical context when working on a planned feature or refactor.
