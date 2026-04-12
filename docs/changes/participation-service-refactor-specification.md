# Specification: Participation Service Refactor

## Overview

This refactor prepares the codebase for future participation-related changes, including "the ride creator becomes a participant immediately after ride creation", by moving participation business orchestration out of the Telegram callback handler and into a dedicated service.

The goal is to keep user-visible behavior unchanged during the refactor while making the participation flow easier to extend, test, and reuse from other entry points.

---

## Problem Statement

`src/commands/ParticipationHandlers.js` currently mixes several responsibilities inside `handleParticipationChange()`:

- Telegram callback handling
- ride lookup and participation precondition checks
- participation state mutation
- creator notification triggering
- attached-group membership synchronization
- ride message refresh coordination
- callback feedback to the user

This creates a poor dependency direction:

- business transition rules live in a command handler
- participation side effects are hard to reuse from non-callback entry points
- adding new participation-related behavior risks more branching in the handler
- tests for transition rules must currently go through the command layer

---

## Goals

- Keep command handlers thin and Telegram-facing.
- Move participation business orchestration into a dedicated service in `src/services/`.
- Align participation and ride-creation flows around a single application-level `UserProfile` DTO.
- Preserve current behavior for join / thinking / skip flows.
- Make participation transition rules reusable from future flows such as ride creation, ride import, or batch operations.
- Improve testability by shifting transition rules into service-level tests.

## Non-Goals

- Do not change the ride participation UX in this phase.
- Do not auto-add the creator to newly created rides in this phase.
- Do not redesign storage or data models unless strictly required for the refactor.
- Do not rewrite unrelated command handlers as part of this change.

---

## Proposed Design

### New Service

Introduce a dedicated application service, for example:

- `src/services/RideParticipationService.js`

This service owns the participation use case and orchestrates existing collaborators:

- `RideService`
- `NotificationService`
- `GroupManagementService`

### User Input Contract

Before the participation-specific refactor, `RideService` should be aligned around a single application-level user DTO:

```js
{
  userId,
  username,
  firstName,
  lastName
}
```

This `UserProfile` contract should replace raw Telegram user objects in `RideService` methods that currently depend on `id`, `first_name`, `last_name`, and `username`.

Methods that only need identity for audit or filtering should continue to accept `userId` rather than a full DTO.

### Suggested API

```js
await rideParticipationService.changeParticipation({
  rideId,
  userProfile,
  targetState,
  language,
  api
});
```

### Suggested Result Shape

```js
{
  status: 'changed' | 'ride_not_found' | 'ride_cancelled' | 'already_in_state',
  ride,
  previousState,
  targetState
}
```

The exact property names may change, but the important point is that the service should return a structured outcome instead of a boolean-only success flag.

---

## Responsibilities After Refactor

### `ParticipationHandlers`

The handler should:

- extract `rideId` from callback data
- build a `UserProfile` from `ctx.from`
- call `RideParticipationService`
- refresh user-visible ride messages
- map the structured result to localized callback feedback
- handle Telegram transport failures gracefully

The handler should not:

- decide when notifications are sent
- decide when attached-group membership changes
- inspect transition pairs such as `joined -> skipped`
- duplicate participation business rules

### `RideParticipationService`

The service should:

- load the ride
- validate participation preconditions
- apply the participation mutation
- decide whether the change is a no-op
- trigger creator notifications through `NotificationService`
- trigger attached-group synchronization through `GroupManagementService`
- return a structured participation result for the handler

The service should accept `UserProfile`, not raw Telegram user data and not a separate participation-only input contract with the same fields.

---

## Why A Dedicated Participation Service

This refactor should introduce a dedicated service rather than expanding `RideService` further.

Reasons:

- participation is already a distinct use case with its own rules and side effects
- keeping `RideService` focused reduces "god service" drift
- future features like creator auto-participation, approval workflows, waiting lists, or bulk state changes will likely reuse the same orchestration
- service-level tests become much clearer when the use case has a single owner

## RideService Alignment

As a first cleanup step inside the broader participation refactor, `RideService` should be made internally consistent:

- methods that only need actor identity keep `userId`
- methods that need a user profile should accept `UserProfile`
- the existing participation input should be renamed or replaced so it also uses `UserProfile`
- raw Telegram user objects should stop crossing the `RideService` boundary

This specifically applies to:

- `createRideFromParams(...)`
- `duplicateRide(...)`
- `getDefaultOrganizer(...)`
- `setParticipation(...)`

This change is intentionally limited to `RideService` in this phase. Other services can be aligned later.

---

## Refactoring Plan

1. Introduce and document `UserProfile` as the normalized app-level user DTO for `RideService`.
2. Refactor `RideService` signatures so raw Telegram user objects are replaced with `UserProfile` where profile data is needed, while `userId` remains in identity-only methods.
3. Align participation input with the same `UserProfile` contract.
4. Add `RideParticipationService` with structured outcomes and no behavior change.
5. Move ride lookup, cancellation check, unchanged-state handling, notification scheduling, and group-sync branching into the new service.
6. Refactor `ParticipationHandlers` so it becomes a thin Telegram adapter over the new service.
7. Update `src/core/Bot.js` to instantiate and inject the new service.
8. Rebalance tests:
   - move transition-rule assertions to `src/__tests__/services/`
   - keep `src/__tests__/commands/participation-handlers.test.js` focused on Telegram mapping and user feedback
9. After the refactor is stable, reuse the service from future ride-creation work so creator auto-participation can be implemented without duplicating logic.

---

## Testing Strategy

Add or adjust tests in these groups:

- service tests for `RideParticipationService`
  - ride not found
  - cancelled ride
  - unchanged state
  - join triggers notification scheduling
  - join triggers attached-group add
  - leaving from `joined` triggers attached-group removal
  - leaving from non-joined state does not remove from group
- `RideService` tests covering `UserProfile` usage
  - create/duplicate flows accept normalized `UserProfile`
  - participation uses `UserProfile`
  - identity-only methods keep `userId` semantics
- command tests for `ParticipationHandlers`
  - callback input is translated into a service request
  - service result is translated into the correct callback answer
  - ride messages are refreshed only after successful change
  - message-refresh failure still returns the expected fallback callback answer

The existing testing guidance in `docs/testing-conventions.md` should remain the baseline.

---

## Files Expected To Change In The Implementation Phase

| File | Type | Change |
|------|------|--------|
| `docs/changes/participation-service-refactor-specification.md` | New | This document |
| `docs/layer-responsibilities.md` | New | Architecture boundary rules for handlers and services |
| `README.md` | Modified | Link to layer-responsibility documentation |
| `SPECIFICATION.MD` | Modified | Document thin-handler rule and refactor direction |
| `docs/testing-conventions.md` | Modified | Cross-reference architecture boundary rules |
| `src/services/RideService.js` | Modified | Replace raw Telegram user inputs with `UserProfile` where profile data is needed |
| `src/services/RideParticipationService.js` | New | Dedicated participation orchestration service |
| `src/commands/ParticipationHandlers.js` | Modified | Delegate use case logic to the new service |
| `src/core/Bot.js` | Modified | Instantiate and inject `RideParticipationService` |
| `src/__tests__/services/ride-service.test.js` | Modified | Cover normalized `UserProfile` inputs |
| `src/__tests__/services/ride-participation-service.test.js` | New | Participation use-case coverage |
| `src/__tests__/commands/participation-handlers.test.js` | Modified | Narrow command-layer assertions |

---

## Acceptance Criteria

- Participation business orchestration is no longer implemented in `ParticipationHandlers`.
- `RideService` no longer accepts raw Telegram user objects in methods that require profile data.
- Participation and ride-creation flows use the same `UserProfile` contract.
- Notification and attached-group rules are owned by the service layer.
- The handler remains responsible only for Telegram-facing input and output concerns.
- Existing join / thinking / skip behavior remains unchanged.
- The codebase is ready for future creator auto-participation work without duplicating participation logic.
