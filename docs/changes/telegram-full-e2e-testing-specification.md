# Specification: Full End-to-End Telegram Testing Kit

## Overview

This change introduces a separate full end-to-end testing kit that exercises the bot through real Telegram.

Unlike the existing scenario harness, this kit uses:
- a real Telegram user account
- the real development bot
- real Telegram chats
- real message delivery, edits, callbacks, and deletions

The goal is not to replace the current fast test suite. The goal is to add a very small smoke layer that validates a few business-critical journeys against real Telegram behavior.

---

## Goals

- Validate that the bot works through real Telegram, not only through in-process simulation
- Catch regressions at the Telegram platform boundary:
  - message delivery
  - message edits
  - inline keyboard callbacks
  - chat targeting
  - deletion behavior
- Keep the kit small, readable, and operationally simple
- Make it easy to add a few high-value smoke scenarios over time

---

## Non-Goals

- Replacing the existing Jest-based fast suite
- Running these tests in the default local or CI test command
- Broad edge-case coverage through real Telegram
- Creating a second large test pyramid
- Supporting parallel execution in the first version

---

## Test Strategy

This kit is a separate test layer above the current suite.

Recommended testing stack after this change:
1. Unit tests
2. Component and service tests
3. Scenario integration tests using the in-process harness
4. Infrastructure and contract tests
5. Full Telegram end-to-end smoke tests

The full Telegram layer should stay very small.

Initial target:
- one end-to-end lifecycle smoke test

Later expansion:
- add only a few more scenarios when they protect critical real-Telegram behavior

---

## High-Level Design

### Runtime Model

The application runs locally using the same bot configuration used for development.

The E2E kit opens a real Telegram user session through MTProto and interacts with the bot exactly as a human user would:
- send messages to the bot in private chat
- wait for bot replies in private chat
- observe bot messages in a specific group
- click inline buttons in Telegram messages
- observe edits and deletions in a specific group

### Core Principle

The user-side E2E kit must not simulate "generic group" or "generic private chat" behavior in its public API.

For private chat with the bot, helpers may be explicit about private-bot interaction.

For groups, helpers must target a specific Telegram chat ID.

This is required so the kit can later support multi-group scenarios such as ride attachment without redesigning the API.

---

## Real Telegram Setup

### Bot

- Use the same development bot token already used by the application
- Do not introduce a separate `E2E_BOT_TOKEN` for the first version
- Resolve the bot username dynamically from Telegram Bot API `getMe` using the configured bot token

### User

- Use a real Telegram user account owned by the developer
- Authenticate through MTProto
- Persist the MTProto session locally so tests do not require fresh login every run

### Chats

The first version needs:
- one private chat with the bot
- one dedicated group chat for E2E verification

The group must be treated as test infrastructure and must not be reused for normal development chatter.

---

## Technology Choice

### MTProto Client

Use `gramjs` for the real Telegram user client.

Reasons:
- Node.js-compatible
- supports persistent user sessions
- can send real messages
- can read chat history
- can interact with inline buttons as a real user

### Test Runner

The E2E kit should run separately from the main Jest suite.

Recommended first version:
- use Jest in a dedicated E2E entrypoint or a small dedicated Node runner
- always run serially
- never include these tests in `./run-tests.sh --mode basic`

---

## Configuration

### Required Environment Variables

- `E2E_TELEGRAM_API_ID`
- `E2E_TELEGRAM_API_HASH`
- `E2E_TELEGRAM_SESSION`
- `E2E_PRIMARY_GROUP_ID`

### Derived Configuration

- bot username:
  - resolved dynamically from Bot API `getMe`
- private bot peer:
  - resolved from the fetched bot username

### Optional Future Configuration

- `E2E_SECONDARY_GROUP_ID`
- timeouts and polling intervals
- session storage path override

---

## File Structure

Recommended first version:

- `docs/changes/telegram-full-e2e-testing-specification.md`
- `e2e/README.md`
- `e2e/config.js`
- `e2e/client/telegram-user-client.js`
- `e2e/client/telegram-observer.js`
- `e2e/client/bot-api.js`
- `e2e/fixtures/ride-fixtures.js`
- `e2e/tests/ride-lifecycle.e2e.test.js`
- `e2e/run-e2e.js`

Optional support files:
- `e2e/session/` for local session persistence if needed
- `e2e/utils/polling.js`

---

## Public E2E Kit API

The kit should expose high-level user-centric helpers.

### Private Bot Interaction

- `sendPrivateCommand(text)`
- `waitForBotPrivateMessage({ contains, timeoutMs })`
- `waitForBotPrivateMessageMatching({ predicate, timeoutMs })`

### Group Observation

- `waitForBotMessageInChat({ chatId, contains, timeoutMs })`
- `waitForEditedBotMessageInChat({ chatId, messageId, contains, timeoutMs })`
- `waitForMessageDeletedInChat({ chatId, messageId, timeoutMs })`

### Inline Button Interaction

- `clickButtonInChat({ chatId, messageId, buttonText })`
- `clickButtonInChat({ chatId, messageId, callbackDataPattern })`

The implementation may support both selectors, but tests should prefer the selector that is most stable for the scenario.

### Optional Inspection Helpers

- `getRecentBotMessagesInChat({ chatId, limit })`
- `extractRideIdFromText(text)`

---

## Behavioral Rules for the Kit

### Polling and Waiting

- Use polling against Telegram history and updates
- Prefer explicit waits for observable state changes
- Do not rely on arbitrary sleeps unless no better mechanism exists
- Centralize timeout and retry behavior in shared helpers

### Message Matching

- Match messages by:
  - explicit chat ID
  - sender identity
  - recency
  - stable text fragments
- Do not rely on exact full-message matches when localized or formatted content may evolve

### Inline Buttons

- Resolve the target message in the specific chat
- Find the correct button on the message reply markup
- Trigger the callback as the real Telegram user
- Wait for the resulting observable change:
  - edited group message
  - private reply
  - deletion

### Test Data

- Every test must use unique ride titles
- Prefer a fixed prefix like `E2E Ride`
- Include a timestamp or random suffix

### Cleanup

- Tests should remove the created ride at the end when feasible
- If cleanup fails, the test should surface that failure clearly
- The kit may later add best-effort stale-data cleanup helpers for old E2E rides

---

## First Scenario

### Scenario Name

`creates, shares, updates, changes participation state, and deletes a ride through real Telegram`

### Flow

1. Open private interaction with the bot
2. Send `/newride ...` in the private chat
3. Wait for bot confirmation in the private chat
4. Publish the ride to the primary group
5. Wait for the bot ride message in `E2E_PRIMARY_GROUP_ID`
6. Update the ride from private chat
7. Wait for the ride message edit in `E2E_PRIMARY_GROUP_ID`
8. Click `join` in the group message
9. Wait for the participation update to appear in the group message
10. Click `thinking` in the same group message
11. Wait for the participation update to appear in the group message
12. Click `skip` in the same group message
13. Wait for the participation update to appear in the group message
14. Delete the ride from private chat
15. Confirm deletion if the product flow requires it
16. Wait for the ride message to be deleted from `E2E_PRIMARY_GROUP_ID`

### Expected Assertions

- private-chat creation flow succeeds
- group publication appears in the configured target group
- update changes the visible ride message in the group
- `join` changes participation display
- `thinking` changes participation display
- `skip` changes participation display
- deletion removes the ride message from the group

This first scenario is intentionally broad. It is a smoke test for the real Telegram path, not a replacement for lower-level focused tests.

---

## How to Write New Full E2E Tests

### Writing Style

Each test should read like a user journey.

Prefer:
- `sendPrivateCommand('/newride ...')`
- `waitForBotMessageInChat({ chatId: E2E_PRIMARY_GROUP_ID, contains: title })`
- `clickButtonInChat({ chatId: E2E_PRIMARY_GROUP_ID, messageId, buttonText: 'Join' })`

Avoid:
- raw MTProto calls inside individual test files
- implicit "group" or "private" abstractions for group assertions
- exact low-level Telegram payload assertions in feature tests

### Test Size

- one E2E test should cover one meaningful smoke journey
- keep the overall suite very small
- add a new test only when it protects a real Telegram integration risk

### Preferred Assertion Style

Assert:
- visible text fragments
- presence or absence of target messages in a concrete chat
- edits on the previously observed message
- deletion of the previously observed message

Avoid:
- over-asserting full formatted message bodies
- over-asserting exact keyboard layout unless the keyboard itself is the feature under test

---

## Execution Model

### Local Execution

Run manually through a dedicated command, for example:
- `npm run test:e2e:telegram`

This command must:
- run serially
- never be part of the default test command
- fail clearly when required Telegram env vars are missing

### CI Policy

Do not add this suite to the default CI test job in the first version.

If later added to CI, it should run:
- in a dedicated job
- behind explicit secrets
- on a schedule or on-demand

---

## Risks and Mitigations

### Risk: Flaky waits due to Telegram latency
- Mitigation:
  - centralized polling
  - conservative timeouts
  - matching by chat ID and stable fragments

### Risk: Pollution of real Telegram chats
- Mitigation:
  - dedicated E2E group
  - unique test data
  - explicit cleanup flow

### Risk: Real user session setup is hard to maintain
- Mitigation:
  - persist session
  - keep setup documented in `e2e/README.md`
  - avoid repeated login prompts

### Risk: E2E suite grows too large
- Mitigation:
  - position it explicitly as a smoke layer
  - require real Telegram-specific value for every new test

---

## Implementation Plan

### Task 1: Bootstrap Telegram user session and config
- Add E2E config loading
- Add Bot API helper to resolve bot username from the configured bot token
- Add `gramjs` session bootstrap and persistent session support

Acceptance criteria:
- the E2E kit can authenticate a real Telegram user
- the bot username is resolved dynamically from Bot API
- the primary group ID is loaded from environment

### Task 2: Build the core E2E driver
- Implement private command sending
- Implement message polling helpers for a specific chat ID
- Implement inline button clicking for a message in a specific chat

Acceptance criteria:
- the driver can send a private command to the bot
- the driver can observe a bot message in a configured group
- the driver can click an inline button on the observed group message

### Task 3: Land the first lifecycle smoke test
- Add the first full Telegram lifecycle test
- Cover create, share, update, join, thinking, skip, and delete

Acceptance criteria:
- the scenario runs end-to-end against real Telegram
- the scenario targets the configured primary group explicitly by chat ID
- the test leaves the environment reasonably clean after execution

### Task 4: Add documentation and command entrypoint
- Add `e2e/README.md`
- Add a dedicated npm script
- Document required env vars and session bootstrap flow

Acceptance criteria:
- a developer can set up and run the first Telegram E2E test from documentation alone

---

## Definition of Done

- A separate full Telegram E2E kit exists and is not wired into the default test run
- The kit uses a real Telegram user account through MTProto
- The kit resolves the bot username dynamically from the configured bot token
- Group assertions target explicit chat IDs, not generic group abstractions
- The first end-to-end lifecycle smoke test passes against real Telegram
- The setup and usage are documented well enough for repeatable local execution
