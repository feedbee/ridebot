# Testing Conventions

## Purpose
Keep test feedback fast and useful while minimizing brittle, implementation-coupled tests.

## Test Taxonomy
- Unit tests:
  - Validate pure logic and small isolated behavior.
  - Mock external boundaries (Telegram API, network, database clients) when needed.
- Component/service tests:
  - Validate business behavior across multiple classes in-process.
  - Prefer real in-memory collaborators where practical.
- Integration/regression tests:
  - Validate infrastructure-specific behavior (e.g., Mongo memory server, webhook wiring).
  - These can be slower and should be used intentionally.

## Assertion Priorities
- Prefer:
  - user-visible outputs (messages, callback responses)
  - persisted state transitions
  - business outcomes and error handling behavior
- Avoid overusing:
  - assertions on internal call order
  - assertions tied to private implementation details
  - brittle checks that fail on harmless refactors

## Stability Rules
- Time/date tests:
  - freeze time in tests that depend on "now"
  - restore timers after each test
  - avoid host-timezone assumptions in assertions
- Webhook/HTTP tests:
  - prefer in-process handler validation over real socket binding in unit/component scope
- Error-path tests:
  - test expected behavior under failure, not console side effects unless essential

## Coverage Policy
- Coverage is a guardrail, not a goal by itself.
- Global thresholds are intentionally moderate to prevent regressions while avoiding coverage-chasing.
- For new tests, prioritize meaningful branch coverage in business-critical flows.

## Practical Guidance for New Tests
- Start from a user scenario or business rule.
- Keep test setup minimal and explicit.
- One behavior per test when possible.
- Name tests by expected behavior, not internal method names.
