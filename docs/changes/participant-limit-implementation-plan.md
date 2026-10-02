# Implementation Plan: Ride Participant Limit

## Architecture Decisions

- Keep `participantLimit` in the existing user-default and ride-settings snapshots.
- Validate all inputs through one strict settings parser.
- Make the storage participation mutation return structured outcomes and enforce capacity atomically.
- Keep side effects in `RideParticipationService` and Telegram feedback in command handlers.
- Route settings text input before wizard and AI text input so only one interactive flow consumes a message.

## Tasks

- [ ] Add the setting contract, default, schema, strict parser, and create/update text support.
  - Acceptance: only canonical `0`–`1000` inputs are accepted; snapshots preserve the value.
  - Verify: settings, field-processor, storage, and ride-service unit tests.
- [ ] Enforce the limit in participation storage and service flows.
  - Acceptance: full rides reject joins without losing the prior state or running side effects; concurrent last-place attempts cannot overfill.
  - Verify: memory storage and participation service tests; Mongo contract tests added but not run by default.
- [ ] Render and localize the limit and rejection outcome.
  - Acceptance: positive limits appear above `Joined`; zero is omitted; full joins receive the approved callback text.
  - Verify: formatter and participation-handler tests in both languages.
- [ ] Add user-default and ride-specific numeric settings input.
  - Acceptance: prompt, validation retry, cancellation, ownership recheck, persistence, and ride-message refresh work through bot routing.
  - Verify: settings-handler, bot-routing, and scenario tests.
- [ ] Run review and regression verification.
  - Acceptance: implementation matches the approved spec and has no unrelated changes.
  - Verify: `./run-tests.sh --mode basic` and multi-axis code review.

## Risks

- MongoDB capacity enforcement must be a single conditional mutation, not a read followed by save.
- A settings prompt must not let the same message leak into the ride wizard or AI handler.
- Ride-specific setting updates must refresh tracked announcements without changing participants.

## Open Questions

None.
