# Testing Conventions

## Purpose
This document defines the project's testing strategy and the default expectations for new tests.

The goals are:
- keep local feedback fast
- protect business-critical behavior from regressions
- test user-visible bot behavior through realistic in-process scenarios
- minimize brittle framework-coupled tests
- allow multiple test levels to coexist when they provide distinct value

Coverage is not the goal by itself. The goal is confidence.

## Current Strategy
The test suite is organized around five complementary layers:

1. Unit tests
2. Component and service tests
3. Scenario integration tests
4. Infrastructure and contract tests
5. Full Telegram E2E smoke tests

These layers are intentionally overlapping in some areas. We allow duplication across levels when the tests answer different questions.

Examples:
- a command-handler test may verify a narrow error branch
- a scenario test may verify the same user journey through real bot wiring
- a storage test may verify the same state transition against a real Mongo-backed implementation

That duplication is acceptable when it improves confidence rather than just repeating the same assertion style.

## Test Layers

### 1. Unit Tests
Use for:
- pure parsing and formatting logic
- field normalization and transformation
- localized string selection
- isolated utility behavior

Characteristics:
- narrow scope
- minimal setup
- mock external boundaries when needed
- fast to run

Good examples:
- date parsing
- route URL detection
- speed and duration parsing
- HTML escaping

### 2. Component and Service Tests
Use for:
- business behavior across one class and its immediate collaborators
- command-handler logic in isolation
- service logic with in-memory storage or mocked edges

Characteristics:
- in-process
- can use real `MemoryStorage`
- may mock Telegram transport, network, or database adapters
- should focus on business rules and error handling

Good examples:
- `RideService` business rules
- command ownership checks
- delete confirmation flow in a single handler
- message propagation error handling

### 3. Scenario Integration Tests
Use for:
- realistic user journeys
- end-to-end in-process command and callback flows
- interactions between middleware, bot wiring, handlers, services, formatting, and in-memory persistence

Characteristics:
- route through the real `Bot` command and callback registration
- use the scenario harness
- use real in-memory collaborators where possible
- mock Telegram only at the outer transport boundary
- assert user-visible outcomes and persisted state

This is the preferred level for new happy-path user journeys.

Current harness:
- [`src/test-setup/scenario-harness.js`](../src/test-setup/scenario-harness.js)

Current scenario suite:
- [`src/__tests__/integration/scenario-harness.test.js`](../src/__tests__/integration/scenario-harness.test.js)

### 4. Infrastructure and Contract Tests
Use for:
- framework boundary verification
- real persistence behavior
- webhook wiring
- thin adapter contracts

Characteristics:
- narrower than scenario tests, but closer to infrastructure
- may use `MongoMemoryServer`
- should verify integration seams, not re-test all business behavior

Good examples:
- MongoDB storage tests
- webhook start-up tests
- `TelegramGateway` contract tests

### 5. Full Telegram E2E Smoke Tests
Use for:
- validating a very small number of critical flows through real Telegram
- catching regressions in real message delivery, edits, callbacks, and deletions
- confirming that the bot still works with live Telegram behavior, not only with in-process simulation

Characteristics:
- use a real Telegram user account through MTProto
- use the real bot and real Telegram chats
- run manually, outside the default local and CI flow
- stay very small and smoke-oriented

Current E2E documentation:
- [`e2e/README.md`](../e2e/README.md)

Current E2E runner:
- [`e2e/run-e2e.js`](../e2e/run-e2e.js)

## Telegram Testing Strategy

### Default Rule
Do not mock `grammy` directly in new application-level tests unless there is a strong reason.

Prefer:
- scenario tests for user journeys
- `TelegramGateway`-level mocks for bot wiring tests
- contract tests for framework mapping

Current Telegram boundary:
- [`src/telegram/TelegramGateway.js`](src/telegram/TelegramGateway.js)

Use it for:
- command registration
- callback registration
- message transport operations exposed through the bot
- webhook middleware creation
- polling start

Do not move business logic into the Telegram boundary.

### When Direct `grammy` Mocking Is Acceptable
Only use direct framework mocking when:
- the code under test is the adapter itself
- a legacy test has not yet been migrated
- mocking the boundary would hide the exact contract being tested

Even in those cases, keep the test focused and avoid asserting internal framework behavior that is irrelevant to the product.

## Scenario Harness Rules
The scenario harness is the main tool for realistic bot behavior tests.

Use it when a new feature changes:
- a user command
- a callback flow
- ride lifecycle behavior
- participation behavior
- ownership and permission rules
- message propagation across tracked ride messages

The harness should:
- instantiate the real `Bot`
- use real middleware, command wiring, and callback wiring
- provide helpers like `dispatchMessage()` and `dispatchCallback()`
- capture replies, edits, callback answers, and delete operations
- expose persisted ride state through in-memory storage

Scenario tests should not:
- assert internal call order between helpers
- rely on exact numbers of internal method invocations unless contract-critical
- recreate Telegram framework details unnecessarily

## Must-Have Scenario Coverage
For new feature work affecting user behavior, prefer adding or extending scenario tests in these families.

### Ride Creation
- `/newride` with valid inline params creates a ride and posts the ride message
- `/newride` without params enters the wizard flow when applicable

### Ride Lifecycle
- create -> update -> cancel -> resume
- create -> delete with confirmation

### Participation
- `join`, `thinking`, `skip` update ride state and visible message content
- repeating the same participation action returns the expected user feedback without mutating state

### Permissions and Ownership
- non-owner cannot update, cancel, resume, or delete another user's ride
- owner can perform the same action successfully

### Error and Fallback Behavior
- invalid parameters return validation feedback and do not persist invalid state
- missing or unknown ride IDs produce user-visible errors
- message update failures degrade gracefully without corrupting stored rides

### Multi-Chat Propagation
- updates to shared rides propagate to all tracked messages
- unavailable tracked messages are removed from tracking

Not every feature needs all of these. New work should add coverage in the relevant family or families.

## What to Test for New Features
When adding a new feature, decide test coverage in this order:

1. What user-visible behavior changed?
2. What business rule or edge case can regress independently?
3. Does the feature cross a framework or infrastructure seam?

Then choose tests accordingly:
- add at least one scenario test if the feature changes a real user journey
- add focused component/service tests for important branches or edge cases
- add a contract or infrastructure test only if a new seam or real infrastructure behavior is involved

### Recommended Default for New Bot Features
For a typical new command or callback:
- 1 scenario test for the main user flow
- 1 to 3 focused command/service tests for error branches, ownership, validation, or unusual edge cases

### Recommended Default for New Parsers or Utilities
- unit tests only, unless the behavior is also critical inside a larger user flow

### Recommended Default for New Infrastructure Seams
- focused contract tests
- scenario coverage only if users would notice a failure at the product level

## Assertion Priorities
Prefer asserting:
- user-visible replies
- callback responses
- edited message content
- persisted ride state
- business outcomes
- permission enforcement
- tracked message side effects

Avoid overusing:
- exact internal call order
- implementation-specific object shapes when a higher-level assertion would do
- assertions on private helpers
- brittle exact counts that fail on harmless additions

Example of brittle assertion to avoid:
- "there must be exactly 13 private commands"

Preferred replacement:
- assert that the key command families are present

## Duplication Across Test Levels
Duplication is allowed when it is intentional.

Keep duplicate tests when:
- they run at different levels and catch different failure modes
- one test protects a narrow branch and another protects a real user journey
- one test uses in-memory behavior and another uses real infrastructure

Reduce duplication when:
- both tests assert the same thing at the same abstraction level
- the lower-value test is weaker and less realistic
- the extra test mostly increases maintenance cost without adding confidence

Example:
- command happy-path logic covered by scenario tests can still coexist with command-level edge-case tests
- an older integration-lite suite that bypasses real wiring should usually be replaced by the harness suite

## Stability Rules

### Time and Date
- freeze time when behavior depends on "now"
- restore real timers after each test
- avoid host-timezone assumptions
- prefer explicit dates or fixed fake time over relative wall-clock dependencies

### Localization
- be explicit about language when localized strings are part of the assertion
- if a test is not about localization, avoid fragile assertions against large localized message bodies

### Webhook and HTTP
- prefer in-process handler validation over real socket binding
- test webhook wiring through the Telegram boundary and Express integration seam

### Persistence
- use `MemoryStorage` by default for component and scenario tests
- use Mongo tests only when validating real persistence behavior or Mongo-specific edge cases

### Error Paths
- assert the user-facing or business-facing effect of the error
- avoid asserting console output unless the logging behavior itself matters

## Performance and Execution

### Default Local Run
Use:
- `./run-tests.sh --mode basic`

This is the standard developer test entrypoint and excludes the slower Mongo-backed storage suite by default.

### Full Telegram E2E Run
Use manually when needed:
- `npm run e2e:bootstrap-session`
- `npm run e2e:run`
- `npm run e2e:telegram`

These tests are intentionally excluded from the default local and CI test flow.
That does not make them optional from a maintenance perspective: if a change affects real Telegram user behavior, the E2E smoke layer should be reviewed and updated as needed.
`npm run e2e:run` is the canonical runner for the full local flow because it starts the bot in development mode, waits for the startup log, and then launches the Telegram scenario suite in the same console.

### Mongo / Infrastructure Run
Use only when needed:
- `./run-tests.sh --mode mongo`

Do not run Mongo mode by default unless the change touches Mongo-specific behavior or the user explicitly asks for it.

## Coverage Policy
- Coverage thresholds are a guardrail, not a design target.
- Do not add low-value tests just to move percentages.
- Prefer meaningful branch coverage in business-critical flows.
- If a new feature is important but hard to cover with unit tests, favor a realistic scenario test over several fragile mock-heavy tests.

## Review Checklist for New Tests
Before merging new tests, check:
- does this test protect behavior a user or maintainer actually cares about?
- is this the right level for the behavior being tested?
- would the test survive a harmless refactor?
- does it assert outcomes more than implementation details?
- does it keep setup understandable and local?
- does it add unique confidence rather than weak duplication?

Before merging user-visible Telegram changes, also check:
- should the manual full Telegram E2E smoke test be run for this change?
- does the existing E2E scenario still reflect the current product flow?
- if the flow changed materially, was the E2E scenario updated?

## Naming and Organization
- Name tests by expected behavior, not by method names alone.
- Keep one primary behavior per test when practical.
- Put scenario tests under `src/__tests__/integration/`.
- Put shared test-only helpers under `src/test-setup/`, not under `__tests__`.
- Keep framework contract tests close to the seam they verify.

## Examples of Good Test Placement
- new parser helper:
  - `src/__tests__/utils/...`
- new command edge-case logic:
  - `src/__tests__/commands/...`
- new user journey spanning multiple layers:
  - `src/__tests__/integration/...`
- new Telegram seam behavior:
  - `src/__tests__/telegram/...`
- new Mongo persistence behavior:
  - `src/__tests__/storage/mongodb-storage.test.js`

## Practical Guidance
- Start from a business rule or user journey.
- Keep setup minimal and explicit.
- Use real collaborators when that improves confidence without major cost.
- Introduce a seam only when it removes repeated brittleness.
- Prefer extending the scenario harness over creating a second integration style.

When in doubt:
- choose the simplest test that would fail for the regression you care about
- if the feature is user-facing, strongly consider adding a scenario test
