# Testing Enhancement Specification (Phase 2)

## Goal
Unblock fast and safe feature development by improving:
- User-behavior scenario coverage
- Telegram-related testability where it blocks realistic scenario tests

## Why This Phase
Current pain points directly impact delivery velocity:
1. There are not enough realistic user-command flows that exercise real bot wiring.
2. Telegram-specific code is hard to test reliably and pushes tests toward brittle framework mocks.
3. Existing fast vs slow test split already exists, but it does not solve the lack of realistic end-to-end in-process scenarios.

## Scope
In scope:
- Test architecture and execution strategy
- Test harness for user command flows
- Telegram integration seams for deterministic testing

Out of scope:
- Replacing Jest
- Large bot architecture rewrite
- Reworking the existing basic vs Mongo test split unless a small follow-up cleanup is needed

## Workstreams

## Workstream A: Real User Behavior Scenarios
### A1. Build a scenario test harness
- Implement helpers like:
  - `dispatchMessage({ text, user, chat })`
  - `dispatchCallback({ data, user, chat, message })`
  - outbox/message capture assertions
  - helpers for topic/thread context and callback source message setup
- Route through real command/callback wiring to mimic actual bot behavior.
- Prefer using real in-memory collaborators where possible:
  - real bot command/callback registration
  - real handlers/services/formatters
  - in-memory storage
- Keep Telegram transport mocked only at the outer boundary:
  - capture sent/edited/deleted messages
  - avoid asserting framework internals unless contract-critical

### A2. Add must-have journey tests
- Ride creation:
  - `/newride` with valid inline params creates a ride and posts the formatted ride message
  - `/newride` without params enters wizard flow and produces the expected prompt sequence
- Ride lifecycle:
  - create -> update -> cancel -> resume using real command/callback wiring
  - create -> delete removes persisted ride and returns user-visible confirmation
- Participation:
  - `join`, `thinking`, `skip` transitions update persisted participation state and visible ride message
  - repeated callback on same state shows "already in state" feedback without changing persistence
- Permissions and ownership:
  - non-owner cannot update/delete/cancel another user's ride
  - owner can perform the same actions successfully
- Error and fallback behavior:
  - invalid ride params return validation feedback and do not persist a ride
  - missing ride ID or non-existent ride returns the correct user-facing error
  - blocked or failed message updates degrade gracefully without corrupting ride state
- Multi-chat/message propagation:
  - ride shared to another chat updates tracked messages correctly
  - unavailable tracked messages are removed from tracking when update propagation runs

### A3. Assertion policy
- Prefer validating:
  - persisted ride state
  - user-visible responses
  - message propagation side effects
- Minimize assertions on internal helper calls unless contract-critical.
- Treat scenario tests as behavior contracts:
  - they should survive harmless refactors
  - they should fail on changes a user would notice

Acceptance criteria:
- At least one must-have scenario exists for each critical flow family above.
- Critical user journeys are covered end-to-end in-process through real bot wiring.
- Scenario tests primarily assert business outcomes and user-visible behavior, not mock call graphs.
- At least one current integration-lite test can be replaced or simplified after the harness lands.

## Workstream B: Telegram Testability
### B1. Introduce a Telegram boundary only where it reduces brittleness
- Add a thin adapter (for example `TelegramGateway`) around framework-specific operations that are currently painful to test:
  - command registration
  - callback registration
  - sending/editing/deleting messages
  - webhook setup/polling start
- Keep business handlers framework-agnostic where practical.
- Do not move business logic into the adapter.
- Start with the smallest seam needed to support the scenario harness and reduce direct `grammy` mocking.

### B2. Test strategy for Telegram integration
- Unit/component tests:
  - mock adapter interface, not `grammy` internals
- Contract tests:
  - a small focused suite validating adapter-to-`grammy` mapping
- Webhook tests:
  - in-process handler/app tests without fragile external port assumptions
- Migration approach:
  - do not rewrite all existing tests at once
  - convert the most brittle `grammy`-heavy tests first

### B3. Trigger for expanding the seam
- Expand the adapter only when one of the following is true:
  - scenario tests are blocked by framework setup complexity
  - multiple test files repeat the same `grammy` mocks
  - framework-specific changes cause unrelated handler tests to fail
- Otherwise, prefer leaving existing direct integrations in place.

Acceptance criteria:
- New scenario tests do not need to mock `grammy` internals directly.
- The most brittle Telegram-heavy tests use the adapter boundary instead of framework-level mocks.
- Telegram integration regressions are covered by a small dedicated contract suite.
- The adapter remains thin and contains no business rules.

## Proposed Execution Order
1. Build the scenario harness with the current architecture and land 1-2 high-value journey tests.
2. Add the must-have journey scenarios for ride lifecycle, participation, permissions, and fallback behavior.
3. Introduce the smallest Telegram boundary needed to reduce brittleness in scenario and handler tests.
4. Add focused adapter contract tests and migrate the most fragile `grammy`-heavy tests.
5. Expand journey coverage iteratively with new features and regressions.

## Implementation Plan
### Slice 1: Minimal scenario harness
- Goal:
  - prove the approach with the smallest useful in-process harness
- Files to touch first:
  - `src/__tests__/integration/main-flows.test.js` or a small replacement split from it
  - `src/__tests__/helpers/scenario-harness.js`
  - only minimal production changes if the first scenario tests are blocked
- Initial harness responsibilities:
  - instantiate the real `Bot`
  - capture registered command/callback handlers through the real bot wiring
  - provide `dispatchMessage()` and `dispatchCallback()`
  - capture reply/edit/callback side effects in an outbox-like structure
  - expose persisted ride state through in-memory storage
- Initial tests to land:
  - `/newride` with valid inline params creates a ride and posts a ride message
  - `join` callback updates participation state and visible ride message

### Slice 2: Must-have journey coverage
- Expand the harness-based suite into focused files for:
  - ride lifecycle
  - participation flows
  - permissions and ownership
  - validation, missing-ride, and degraded-update behavior
  - multi-chat propagation
- Prefer adding scenario tests before adding new abstractions.
- Replace or simplify at least one existing integration-lite test once equivalent scenario coverage exists.

### Slice 3: Minimal Telegram seam
- Only after Slice 1-2, introduce the smallest adapter needed to reduce repeated `grammy` mocks.
- Target the most brittle Telegram-heavy tests first:
  - bot wiring tests
  - webhook contract tests
  - any handler tests repeatedly mocking framework details
- Keep the seam transport-focused and free of business logic.

## Risks and Mitigations
- Risk: Scenario harness becomes hard to maintain.
  - Mitigation: centralize fixtures/builders; strict helper API.
- Risk: Scenario tests become too broad and slow.
  - Mitigation: keep must-have scenarios focused on critical flows; use in-memory collaborators by default.
- Risk: Adapter layer introduces complexity without enough payoff.
  - Mitigation: add the seam only after the first scenario harness pass; keep it thin and justified by repeated pain.

## Deliverables
- New phase-2 test architecture doc (this file)
- Scenario test harness + first journey scenarios
- Must-have journey suite for critical user flows
- Telegram adapter abstraction + initial contract tests where justified

## Definition of Done
- Key user command journeys are covered by realistic in-process scenario tests.
- Telegram-heavy logic needed by those scenarios is testable without brittle framework-level mocks.
- The test strategy is more behavior-focused and less coupled to framework internals.
