# Specification: Private Ride Owner Action Buttons

## Overview

When the ride creator views their own ride message in a private chat with the bot, the message should show an additional owner-only management keyboard below the existing participation buttons.

The new keyboard adds two rows:

```text
Edit     Duplicate     Delete
Cancel/Resume     Participants     Settings
```

The behaviour must reuse the existing command implementations and user experience as closely as possible:

- `Edit` starts the same wizard flow as `/updateride`
- `Duplicate` starts the same wizard flow as `/dupride`
- `Delete` shows the same confirmation UX as `/deleteride`
- `Cancel` / `Resume` performs the same state transition as `/cancelride` / `/resumeride`
- `Participants` shows the same output as `/listparticipants`
- `Settings` is visible but its product behaviour is intentionally not defined yet

These buttons must appear only:

- in private chats with the bot
- on ride messages that belong to the ride creator

They must not appear:

- for non-creators
- in groups, supergroups, or channels
- on other users' private ride copies

---

## Goals

- Add owner-only management buttons to creator-private ride messages.
- Keep the current command UX unchanged.
- Keep button-triggered management flows free from stray chat messages.
- Reuse existing command/service logic instead of introducing parallel callback-only business flows.
- Preserve the existing participation buttons and ride message synchronization behaviour.
- Leave room for a future notification settings UX without redesigning the keyboard contract again.

---

## Non-Goals

- Defining the full settings management UX in this change.
- Changing the existing behaviour of `/updateride`, `/dupride`, `/deleteride`, `/cancelride`, `/resumeride`, or `/listparticipants`.
- Showing owner management buttons in shared/group ride messages.
- Moving unrelated business logic between layers.

---

## Current Facts From The Codebase

### Message rendering

- `MessageFormatter.getRideKeyboard()` currently builds only the participation buttons.
- `MessageFormatter.formatRideWithKeyboard()` already accepts `options.isForCreator`.
- `RideMessagesService.createRideMessage()` sets `isForCreator = ctx.chat?.type === 'private' && ctx.from?.id === ride.createdBy`.
- `RideMessagesService.updateRideMessages()` reuses stored `messageInfo.isForCreator` when refreshing all tracked ride messages.

This means the formatter and ride-message refresh pipeline already know whether a tracked message is the creator's private copy, which is the correct place to decide whether owner buttons should exist.

### Existing command reuse opportunities

- `DeleteRideCommandHandler` already separates the confirmation callback logic into `handleConfirmation(ctx)`.
- `CancelRideCommandHandler` and `ResumeRideCommandHandler` already share their core flow through `RideStateChangeHandler`.
- `UpdateRideCommandHandler`, `DuplicateRideCommandHandler`, and `ListParticipantsCommandHandler` currently depend on extracting the ride ID from `ctx.message`.
- Wizards already enforce private-chat-only execution in `RideWizard.startWizard()` and `RideWizard.handleWizardAction()`.

### Existing architectural guidance

- Command handlers are the Telegram-facing boundary.
- Reusable business logic should not be duplicated across commands and callbacks.
- Service APIs should stay Telegram-agnostic.

This change should therefore reuse existing handlers where practical and extract small Telegram-facing helper methods when callback entry points need the same flow with a known `rideId`.

---

## UX Requirements

### Visibility rules

Owner action buttons are rendered only when all of the following are true:

- the message is in a private chat
- the message is marked as `isForCreator`
- the viewer is the ride creator

The existing storage-backed `messageInfo.isForCreator` field remains the primary signal during message refreshes.

### Keyboard layout

The final keyboard layout should be:

1. Existing participation row, only when the ride is not cancelled:
   - `Join`
   - `Thinking`
   - `Skip`
2. Owner row 1:
   - `Edit`
   - `Duplicate`
   - `Delete`
3. Owner row 2:
   - `Cancel` if `ride.cancelled === false`, otherwise `Resume`
   - `Participants`
   - `Settings`

If the ride is cancelled, the participation row stays hidden exactly as today, while the two owner rows are still shown for the creator's private copy.

### Button behaviour

#### Edit

- Starts the same update wizard as `/updateride` without params.
- Uses the same prefill data as the command flow.
- Keeps all existing private-chat-only wizard behaviour.

#### Duplicate

- Starts the same duplicate wizard as `/dupride` without params.
- Uses the same tomorrow-prefill logic as the command flow.

#### Delete

- Shows the same confirmation message and confirmation buttons as `/deleteride`.
- Confirm and cancel callbacks continue to use the current delete confirmation UX.
- Deletion must always keep an explicit confirmation step, regardless of whether it was started by a command or by a button.

#### Cancel / Resume

- Executes the same ownership checks, state validation, state transition, ride message refresh, and user-facing success/error messaging as the existing commands.
- Button label depends on current ride state:
  - active ride -> `Cancel`
  - cancelled ride -> `Resume`

#### Participants

- Sends the same participant list message as `/listparticipants`.
- No new presentation format is introduced.

#### Settings

- The button is present in the keyboard.
- No full settings UX is defined in this change.
- The implementation should reserve a dedicated callback action name for future expansion.
- For now the callback may be a minimal placeholder acknowledgement, but it must not trigger unrelated behaviour or corrupt state.

### Result delivery rules

The transport for final user-facing results depends on how the user entered the flow.

If the flow was started by a command message:

- final user-facing results should be sent as normal chat messages
- the interaction should continue to feel like a conversational command flow

If the flow was started by an inline button:

- final user-facing results should be shown as popup callback statuses
- the bot should avoid leaving detached reply messages in the chat

This applies to comparable outcomes across the supported owner flows, including:

- wizard cancellation
- delete cancellation
- delete success/failure
- cancel/resume success/failure
- equivalent result states already present in the existing command UX

The wording and meaning of the outcome should stay consistent across both entry modes. Only the delivery transport changes.

### Delete confirmation UX details

Delete keeps its explicit confirmation step in both entry modes.

Additional requirements:

- command-origin delete flow keeps the normal chat-style confirmation and result experience
- button-origin delete flow may still show the confirmation prompt in chat, but the final result after confirm/cancel must follow the popup-status rule
- rejecting deletion from a button-origin flow must not leave an unnecessary standalone result message in chat

### Refresh consistency rules

After any state-changing owner action, ride messages must remain product-consistent.

At minimum:

- the `Cancel` / `Resume` label must reflect the current ride state after refresh
- participation buttons must remain aligned with the ride state
- the creator's private ride copy must continue showing owner-only rows after refresh
- non-creator and non-private ride messages must never gain owner-only rows during refresh

---

## Technical Design

### 1. Extend ride keyboard composition

Refactor the formatter keyboard API so owner buttons are composed in the formatter instead of appended ad hoc elsewhere.

Recommended shape:

- keep `formatRideWithKeyboard(ride, participation, options)`
- extend `getRideKeyboard(ride, language, isForCreator = false)`
- let `formatRideWithKeyboard(..., options)` translate `options.isForCreator` into the explicit `isForCreator` argument when calling `getRideKeyboard()`

Responsibilities:

- formatter decides keyboard layout only
- handlers decide what each callback does
- services continue to own ride mutations and message synchronization

### 2. Add dedicated callback patterns for owner actions

Register callback handlers in `Bot` for owner actions, for example:

- `rideowner:update:<rideId>`
- `rideowner:duplicate:<rideId>`
- `rideowner:delete:<rideId>`
- `rideowner:togglecancel:<rideId>` or separate `cancel` / `resume`
- `rideowner:participants:<rideId>`
- `rideowner:settings:<rideId>`

Exact names can vary, but the contract should:

- stay clearly separated from participation callbacks
- keep ride IDs directly available from `ctx.match`
- leave a stable namespace for future owner actions

### 3. Reuse existing command logic through ride-aware entry points

The key refactor is to let command handlers operate from either:

- a command message that must first resolve a ride
- a callback that already carries `rideId`

Recommended approach:

- keep the current `handle(ctx)` methods for commands
- extract small reusable methods on relevant handlers that accept an already loaded ride, for example:
  - `UpdateRideCommandHandler.startUpdateWizard(ctx, ride)`
  - `DuplicateRideCommandHandler.startDuplicateWizard(ctx, ride)`
  - `DeleteRideCommandHandler.sendDeleteConfirmation(ctx, ride)`
  - `RideStateChangeHandler.handleRide(ctx, ride)`
  - `ListParticipantsCommandHandler.showParticipants(ctx, ride)`

This preserves the command entry points while giving callbacks a direct reuse path.

### 4. Avoid callback-specific business duplication

Callback handlers should not reimplement:

- ownership checks
- ride existence checks
- state transition rules
- wizard prefill logic
- participant list formatting
- delete confirmation rendering

Instead:

- shared extraction/loading helpers can live in `BaseCommandHandler`
- command handlers can expose ride-based helper methods
- existing services remain the source of truth for mutations

### 5. Shared ride loading and creator validation

`BaseCommandHandler` should likely gain a helper for callback-driven flows that already have `rideId`, for example:

- `getRideById(ctx, rideId)`
- or `getRideWithCreatorCheck(ctx, rideId, creatorOnlyMessage)`

This avoids fabricating fake `ctx.message.text` just to reuse `extractRide()`.

This is preferable to shortcuts such as:

- building fake command text
- mutating `ctx.message`
- routing callbacks through synthetic command messages

### 6. Preserve message refresh behaviour

No data model changes are required for tracked ride messages.

The current refresh flow already stores whether a tracked message is the creator's private copy. Once the formatter knows how to add owner rows for `isForCreator`, all existing ride updates should automatically keep the keyboard in sync across:

- create
- update
- duplicate target message creation
- participation changes
- cancel/resume
- group attachment changes

---

## Suggested Refactor Boundaries

### `MessageFormatter`

- extend keyboard generation to support owner rows
- add localized labels for new owner buttons
- keep participation button behaviour unchanged

### `BaseCommandHandler`

- add helper(s) to load a ride from an explicit `rideId`
- optionally add helper(s) for creator validation when the ride is already loaded

### `UpdateRideCommandHandler`

- extract wizard-prefill creation into a reusable helper/method
- expose a method reusable from callback entry points

### `DuplicateRideCommandHandler`

- extract duplicate-prefill creation into a reusable helper/method
- expose a method reusable from callback entry points

### `DeleteRideCommandHandler`

- extract the confirmation-message sending path into a reusable method
- keep `handleConfirmation(ctx)` unchanged except for callback namespace updates if needed

### `RideStateChangeHandler`

- extract the core state-change flow to a ride-based method reusable by both command and callback entry points

### `ListParticipantsCommandHandler`

- extract the message-building/sending flow to a ride-based method reusable by both command and callback entry points

### `Bot`

- register owner-action callbacks
- wire them to the corresponding handler methods

---

## Callback Behaviour Details

### Ownership and permissions

Every owner-action callback except the placeholder settings callback must enforce creator ownership the same way as the corresponding command:

- if ride is missing -> use the same not-found response pattern as the reused flow
- if user is not the creator -> use the same creator-only response pattern as the reused flow

Because the buttons are rendered only for creator-private messages, these checks are mostly defensive, but they must still exist.

### Callback acknowledgements

For callbacks that trigger a message reply or wizard start:

- answer the callback query to avoid a stuck Telegram spinner
- keep user-visible messages aligned with the current command UX

For delete confirmation:

- preserve the current confirmation callback semantics

For settings:

- answer the callback query with a minimal placeholder string or empty acknowledgement
- do not create a fake unfinished settings flow yet

---

## i18n Changes

Add button labels for both English and Russian:

- `buttons.edit`
- `buttons.duplicate`
- `buttons.delete`
- `buttons.cancelRide`
- `buttons.resumeRide`
- `buttons.participants`
- `buttons.settings`

If the project prefers grouping these under another namespace, keep it consistent across both locales, but the labels should be formatter-driven and not hardcoded in handlers.

---

## Testing Strategy

Follow the documented default:

- at least one scenario test for the user-visible journey
- focused command/formatter tests for critical branches

### Scenario coverage

Add scenario integration coverage for:

1. creator opens a ride in private chat and sees owner rows
2. non-creator does not see owner rows
3. creator copy in private chat shows `Cancel`, and after cancellation the refreshed message shows `Resume`
4. group/shared ride copies never show owner rows even for the creator
5. owner action callbacks trigger the expected UX:
   - update button starts wizard
   - duplicate button starts wizard
   - delete button opens confirmation
   - participants button sends participant list
6. command-origin flows continue to send final results as normal chat messages
7. button-origin flows show final results as popup statuses instead of stray reply messages
8. delete cancellation from a button-origin flow does not leave a standalone chat result message

### Focused tests

Add or update focused tests for:

- `MessageFormatter.getRideKeyboard()` owner vs non-owner rendering
- relevant command-handler reusable ride-based methods
- callback registration in `Bot`
- delete callback namespace changes if callback data is updated
- origin-dependent result delivery for delete, cancel/resume, and wizard cancel/finish paths

### Regression points

Protect against:

- owner rows leaking into non-private or non-creator messages
- cancelled rides losing owner rows entirely
- callback handlers duplicating business rules differently from commands
- reply markup refreshes removing owner rows after state changes
- button-origin flows leaving stray chat messages for final result statuses

---

## Files Expected To Change

| File | Change |
|---|---|
| `docs/changes/private-ride-owner-action-buttons-specification.md` | New specification |
| `src/formatters/MessageFormatter.js` | Extend keyboard generation with owner-only rows |
| `src/core/Bot.js` | Register owner-action callbacks |
| `src/commands/BaseCommandHandler.js` | Add explicit-ride loading / creator-check helpers |
| `src/commands/UpdateRideCommandHandler.js` | Expose ride-based update wizard entry point |
| `src/commands/DuplicateRideCommandHandler.js` | Expose ride-based duplicate wizard entry point |
| `src/commands/DeleteRideCommandHandler.js` | Expose reusable confirmation sender |
| `src/commands/RideStateChangeHandler.js` | Expose reusable ride-based state change flow |
| `src/commands/ListParticipantsCommandHandler.js` | Expose reusable ride-based participants flow |
| `src/i18n/locales/en.js` | Add button labels and optional placeholder text |
| `src/i18n/locales/ru.js` | Same keys in Russian |
| `src/__tests__/formatters/message-formatter.test.js` | Owner keyboard rendering tests |
| `src/__tests__/core/bot.test.js` | Callback registration tests |
| `src/__tests__/integration/scenario-harness.test.js` | Scenario coverage for owner buttons and callbacks |
| Command handler unit tests | Extend coverage for extracted reusable methods where needed |

---

## Open Product Detail

`Settings` is intentionally underdefined.

Implementation recommendation for this change:

- render the button now
- reserve a stable callback action for it
- respond with a harmless placeholder acknowledgement until the real notification-settings UX is specified

This keeps the keyboard stable without forcing premature UX design into the current scope.
