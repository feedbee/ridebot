# Coding Preferences

This document mirrors and extends the guidance from `.cursor/rules/coding-preferences.mdc` so it is visible to agents that rely on repository documentation.

## Core Principles

- Prefer simple solutions over clever ones.
- Keep changes tightly scoped to the requested task.
- Reuse existing patterns before introducing new abstractions, technologies, or architectural styles.
- Avoid duplication by checking whether similar logic already exists elsewhere in the codebase.
- Keep the codebase clean and organized after the change, not just during the change.

## Implementation Rules

- Make only changes that are requested, or that are clearly necessary to complete the requested work safely.
- When fixing a bug, first exhaust options within the current implementation and architecture before introducing a new pattern.
- If a new pattern or abstraction is truly necessary, remove the superseded implementation so duplicate logic does not remain in the codebase.
- Consider all supported environments when writing code: development, test, and production.
- Do not add fake, stub, or demo data to runtime code paths. Mocking belongs in tests only.
- Do not add one-off scripts unless there is a clear repeatable need for them.
- Never overwrite `.env` or other local environment configuration without explicit user confirmation.
- Add `/** Docblock */` comments for classes and methods. Document parameters with typed `@param` annotations, and include `@returns` where it helps clarify behavior or output.

## Scope And Maintainability

- Focus on the parts of the codebase relevant to the task.
- Do not modify unrelated code unless it is directly required for correctness or to remove coupling introduced by the change.
- Think through which methods, modules, tests, and user flows may be affected before finalizing a change.
- Prefer small, composable modules over large files with multiple responsibilities.
- When a file grows beyond roughly 200-300 lines and starts mixing concerns, consider refactoring it into smaller units.

## Architecture And Consistency

- Do not make major architectural changes to a working feature unless the task explicitly calls for that.
- Follow the project layer boundaries documented in [`layer-responsibilities.md`](./layer-responsibilities.md).
- Keep business rules in the service layer or other appropriate domain/application abstractions, not in Telegram-specific command handling.
- Prefer extending established project conventions over creating parallel patterns for similar problems.
- Keep service method signatures framework-agnostic. Prefer app-level DTOs such as `UserProfile` over raw Telegram objects.
- If a service only needs identity, pass `userId` rather than a larger object.

## Testing Expectations

- Write thorough tests for major functionality changes.
- Update existing tests when behavior changes, instead of layering new tests on top of obsolete assumptions.
- Follow [`testing-conventions.md`](./testing-conventions.md) for test scope, layering, and strategy.
- Keep test data realistic and aligned with actual user flows.
