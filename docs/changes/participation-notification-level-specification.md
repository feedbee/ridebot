# Specification: User Participation Notification Level

## Status

Product behavior approved on 2026-08-27. This document specifies the change only; implementation is a separate phase.

## Objective

Let a ride creator choose how much detail they receive in private participation notifications without configuring every ride separately.

Two notification levels are available:

1. **All participation changes** — notify about a debounced change to final `joined`, `thinking`, or `skipped` state.
2. **Ride membership changes only** — notify only when a person actually enters or leaves the ride's confirmed `joined` set.

The level is a live user preference. It applies to all rides created by that user and is evaluated using its current value when a notification is about to be sent. It is not copied into a ride and is not configured per ride.

## Assumptions And Decisions

- Existing `ride.settings.notifyParticipation` remains the per-ride on/off switch. This change does not remove it or change its snapshot semantics.
- The new level is stored separately under the creator's user settings because it is a live cross-ride preference, not a default for future rides.
- The system default is `all`, preserving the existing notification-detail level for users without a stored value.
- A transition into `joined` is relevant. Any transition from `joined` to another state is also relevant.
- `thinking` and `skipped` are both outside the confirmed ride membership. Initial selection of either state and transitions between them do not produce notifications in membership-only mode.
- Existing creator self-notification suppression and the 20-second debounce duration remain in effect.
- Debounce is defined consistently for both levels as one aggregate transition from the state before the first action in the window to the last state in the window. Intermediate states are ignored.
- If the initial and final states are equal, no notification is sent in either level.
- Existing notification templates remain unchanged. Membership-only mode filters notifications; it does not translate relevant transitions into new generic “joined” or “left” messages.
- Existing notification footer text remains unchanged.
- The effective preference is read at delivery time, after the debounce window. A change made while a notification is pending affects that pending notification.

## Non-Goals

- Do not add the notification level to individual ride settings, ride creation, ride update, duplicate flows, or the ride wizard.
- Do not remove the ability to disable participation notifications for one ride with `ride.settings.notifyParticipation`.
- Do not add more notification levels, per-state checkboxes, participant-specific rules, or per-ride overrides for the new level.
- Do not change ride participation state, ride message rendering, attached-group membership rules, or the participant's own callback response.
- Do not send historical or catch-up notifications after a preference change.

## User Experience

### Entry Point

The preference is shown and changed in the private `/settings` user screen.

The user settings screen must visually distinguish:

- **Defaults for new rides**, which continue to contain ride snapshot defaults such as `notifyParticipation` and `allowReposts`.
- **Notification preferences**, which contains the new live participation-notification level.

The ride-scoped `/settings #rideId` screen remains unchanged and must not show this preference.

### Control

Show two explicit localized choices in the user settings inline keyboard:

- `All participation changes`
- `Joins and leaves only`

The currently selected choice must be visually identifiable, for example with a check mark. Selecting either choice writes that exact level, redraws the settings message, and acknowledges the callback. Re-selecting the active choice is an idempotent no-op and must tolerate Telegram's “message is not modified” response, consistent with existing settings callbacks.

Suggested callback data, kept within Telegram's callback-data limit:

```text
settings:user:notification-level:all
settings:user:notification-level:membership
```

Exact wording may be refined during localization, but English and Russian must communicate the distinction between every participation status and actual ride membership.

## Data Model

### Canonical Field

Add a live preference outside `rideDefaults`:

```js
user.settings = {
  rideDefaults: {
    notifyParticipation: true,
    allowReposts: false
  },
  participationNotificationLevel: 'all'
};
```

Allowed persisted values:

```js
'all' | 'membership'
```

Semantics:

- `all`: use the existing final participation-state notification behavior.
- `membership`: notify only when confirmed membership changes.

Missing or unrecognized values resolve to `all`. Reading the effective default must not create or update a user record. No data migration is required.

### Persistence

- Extend the storage interface typedef and Mongo user settings schema with `participationNotificationLevel`.
- Memory storage should continue preserving the complete `settings` object during user upsert.
- Updating this preference must merge with the existing user settings and preserve `settings.rideDefaults` and any other settings.
- Updating ride defaults must likewise preserve `participationNotificationLevel`; neither update path may replace the other settings branch.

## Effective Notification Rules

### First Gate: Ride-Level Enablement

If `ride.settings.notifyParticipation` is false, no participation notification is scheduled or sent, regardless of the user's level.

If the actor is the ride creator, no notification is scheduled or sent, preserving current behavior.

### Second Gate: Current User Level

Immediately before delivery, load the creator user by `ride.createdBy` and resolve the current level. Do not rely on a user object or preference captured when the participation action occurred.

After debounce resolves the initial and final states, this produces the following behavior:

| Previous state | Final state | `all` | `membership` |
|---|---|---|---|
| none | `joined` | joined | joined |
| `thinking` | `joined` | joined | joined |
| `skipped` | `joined` | joined | joined |
| `joined` | `thinking` | thinking | thinking |
| `joined` | `skipped` | skipped | skipped |
| none | `thinking` | thinking | no notification |
| none | `skipped` | skipped | no notification |
| `thinking` | `skipped` | skipped | no notification |
| `skipped` | `thinking` | thinking | no notification |

Repeated selection of the current state is already a no-op in the participation service and does not reach notification scheduling.

### Debounce Aggregation And Filtering

The debounce key remains `${rideId}:${participantUserId}`, with a 20-second delay.

Each pending entry must retain:

- the participant
- the state before the first action in the current debounce window (`initialState`)
- the latest target state (`finalState`)
- the timer and delivery dependencies

On subsequent changes within the same window, preserve `initialState`, replace `finalState`, and restart the timer. At delivery:

- If `initialState === finalState`, send nothing in either level.
- `all` otherwise sends the existing template for `finalState`.
- `membership` sends the same existing `finalState` template only when membership changed across the window:
  - `initialState !== 'joined'` and `finalState === 'joined'`; or
  - `initialState === 'joined'` and `finalState !== 'joined'`.
- Other aggregate transitions are suppressed in `membership` mode.

Examples in membership-only mode:

- none → `joined` → `thinking` within 20 seconds: no notification in membership-only mode because both initial and final states are outside `joined`; `all` sends the existing `thinking` notification.
- `thinking` → `joined` → `skipped` within 20 seconds: no notification in membership-only mode because confirmed membership did not change; `all` sends the existing `skipped` notification.
- `joined` → `thinking` → `joined` within 20 seconds: no notification in either mode because initial and final states are equal.
- `joined` → `thinking` → `skipped` within 20 seconds: one existing `skipped` notification in both modes because the aggregate transition exits `joined`.

Both levels therefore observe the same aggregate state transition. The selected level only determines whether that transition is relevant; when it is relevant, the existing template for `finalState` is used.

## Service And Layer Responsibilities

### `RideParticipationService`

- Continue owning the participation transition and notification side-effect trigger.
- Pass both `previousState` and `targetState` to notification scheduling so the notification layer can establish the initial state and update the final state of the debounce window.
- Keep Telegram contexts out of service contracts; the existing Telegram API boundary may continue to be passed for delivery.

### `NotificationService`

- Continue owning debounce, self-suppression, filtering, message selection, and delivery.
- Depend on a narrow settings/user-preference reader (for example `SettingsService`) instead of reading storage from a command handler.
- Resolve the creator's current notification level at delivery time.
- Keep `ride.settings.notifyParticipation` as the per-ride gate.
- Handle preference lookup and Telegram delivery failures without failing the already-persisted participation change.

If preference lookup fails unexpectedly, log the failure and use the backward-compatible `all` level for that delivery. A missing user record is not an error and also resolves to `all`.

### `SettingsService`

- Define the allowed values and the `all` system default in one place.
- Expose a read method returning the effective current level without materializing a user.
- Expose an update method that upserts the explicit user action and preserves ride defaults.
- Ensure existing ride-default update/materialization methods preserve unrelated user settings.

### `RideSettingsCommandHandler`

- Render the new preference only in user scope.
- Parse and validate only known level callback values.
- Delegate reads and writes to `SettingsService`.
- Keep notification policy decisions out of the command handler.

## Notification Content And Localization

Both levels use the existing `joined`, `thinking`, and `skipped` templates without changing their text. For example, `joined` → `thinking` still uses the existing `thinking` notification; membership-only mode merely allows that relevant transition through.

The existing notification footer remains unchanged, including its ride-specific disable instructions.

Add English and Russian keys for:

- the notification-preferences section title or hint
- the setting label/current values
- both selectable level labels
- the settings-updated acknowledgement if the existing generic message is insufficient
- help text describing the difference between the live user preference and per-ride enablement

All participant names and ride titles must continue to use the existing safe HTML formatting behavior.

## Compatibility And Migration

- Existing users need no migration: absence of the field behaves as `all`.
- Existing and future rides do not store the new field.
- Existing `notifyParticipation: false` ride snapshots remain authoritative and suppress all notifications.
- Existing user ride defaults retain their meaning: they decide whether future rides enable notifications, not which detail level is delivered.
- Existing pending timers created before a rolling deployment may lack transition metadata in memory; process-local timers disappear on restart, so no persisted migration is required.

## Testing Strategy

Use Jest with fake timers for debounce behavior and real `MemoryStorage` where service-level persistence behavior matters.

### Settings Service Tests

- missing user and missing field resolve to `all` without creating a record
- stored `membership` resolves correctly
- invalid stored value falls back to `all`
- updating the level preserves `rideDefaults`
- updating ride defaults preserves the level
- first explicit preference update materializes the user

### Settings Handler Tests

- user `/settings` renders both levels and marks the active one
- ride-scoped settings do not render the new preference
- each valid callback persists the requested level and redraws the screen
- repeated active selection is idempotent and tolerates “message is not modified”
- unknown callback values are rejected without persistence

### Notification Service Tests

- `all` preserves notifications for all three final states
- `membership` follows every transition in the rules table
- both levels compare the state before the first action with the final state after debounce
- equal initial and final states suppress delivery in both levels
- `joined` → `thinking` → `skipped` delivers the existing `skipped` notification in both levels
- `joined` → `thinking` → `joined` delivers nothing in both levels
- changing `all` to `membership` during the debounce window filters the pending delivery
- changing `membership` to `all` during the debounce window sends the final-state notification
- missing user uses `all`
- a preference-read failure logs and falls back to `all`
- per-ride opt-out and creator self-suppression still win
- multiple rides and participants remain independently debounced
- Telegram delivery failure remains non-fatal

### Participation Service Tests

- notification scheduling receives both previous and target state for a successful change
- repeated-state, missing-ride, and cancelled-ride paths schedule nothing

### Scenario Integration Coverage

Add at least one realistic in-process user journey:

1. Creator opens `/settings` and selects membership-only notifications.
2. Another user selects `thinking` or initially selects `skipped`; no DM is delivered after debounce.
3. The user joins; the existing joined DM is delivered.
4. The user changes from joined to thinking or skipped; the existing target-state DM is delivered.
5. Creator switches back to all changes; a later non-membership status change produces the existing detailed DM.
6. In one debounce window, a joined user selects `thinking` and then `skipped`; one existing `skipped` DM is delivered because the aggregate transition is `joined` → `skipped`.
7. In one debounce window, a joined user leaves and rejoins; no DM is delivered because the initial and final states are both `joined`.

Keep Mongo tests focused on schema/storage preservation. Do not run Mongo mode by default.

## Commands

Run commands through the repository's devcontainer-aware wrapper:

```bash
./scripts/devcontainer-exec.sh npm test -- --runInBand src/__tests__/services/settings-service.test.js
./scripts/devcontainer-exec.sh npm test -- --runInBand src/__tests__/services/notification-service.test.js
./scripts/devcontainer-exec.sh npm test -- --runInBand src/__tests__/services/ride-participation-service.test.js
./scripts/devcontainer-exec.sh npm test -- --runInBand src/__tests__/commands/ride-settings-command-handler.test.js
./run-tests.sh --mode basic
```

No new runtime dependency, build command, or CI change is required.

## Project Structure And Likely Files

| Area | Likely files | Responsibility |
|---|---|---|
| Specification | `docs/changes/participation-notification-level-specification.md` | Source of truth before implementation |
| User settings model | `src/storage/interface.js`, `src/storage/mongodb.js` | Persist the live enum preference |
| Settings rules | `src/services/SettingsService.js` | Default, validation, read, merge, update |
| Participation transition | `src/services/RideParticipationService.js` | Supply previous and target states |
| Notification policy | `src/services/NotificationService.js` | Debounce, live lookup, filtering, delivery |
| Settings UI | `src/commands/RideSettingsCommandHandler.js`, bot callback registration | Render and update the user-level choice |
| Localization | `src/i18n/locales/en.js`, `src/i18n/locales/ru.js` | Settings UI and help text; existing notification text stays unchanged |
| Tests | corresponding `src/__tests__/services`, `commands`, `integration`, and storage tests | Regression and acceptance coverage |

The exact file split may follow existing patterns, but reusable notification policy must remain in services rather than Telegram command handlers.

## Code Style

Use the existing JavaScript module and JSDoc conventions. Prefer a small explicit resolver over scattered string comparisons:

```js
/**
 * Resolve a persisted participation notification level.
 * @param {string|undefined} value
 * @returns {'all'|'membership'}
 */
static resolveParticipationNotificationLevel(value) {
  return value === 'membership' ? 'membership' : 'all';
}
```

Constants should replace repeated enum literals where that improves validation and callback rendering. Do not introduce a general settings framework solely for this change.

## Boundaries

### Always

- Preserve the per-ride notification enable/disable setting.
- Read the live user level at delivery time.
- Preserve the first pre-change state across a debounce window and compare it with the final state.
- Preserve unrelated user settings on every partial update.
- Keep business policy in services and add focused plus scenario coverage.
- Run `./run-tests.sh --mode basic` before considering implementation complete.

### Ask First

- Changing the two allowed levels or their default.
- Removing per-ride notification enablement.
- Changing the 20-second debounce duration.
- Adding a migration, dependency, new command, or broader settings redesign.

### Never

- Store the new level in a ride snapshot.
- Send a notification for initial `thinking`, initial `skipped`, or transitions between those two states in membership-only mode.
- Introduce new notification wording for membership-only mode.
- Send any notification when the initial and final states of the debounce window are equal.
- Create a user record during a read-only settings or notification lookup.
- Let notification lookup/delivery failure roll back or fail participation changes.
- Run Mongo test mode unless explicitly requested.

## Success Criteria

- `/settings` exposes exactly two visually selectable participation notification levels in user scope.
- The saved choice applies to every ride owned by the user and can be changed at any time.
- The effective choice is fetched immediately before notification delivery, including pending debounced notifications.
- `all` sends the existing final-state template for every aggregate state change.
- `membership` sends the existing final-state template only when the aggregate transition enters or exits `joined`.
- Both levels compare the state before the first action in the debounce window with the last state, and both suppress equal-state round trips.
- Initial `thinking`, initial `skipped`, and `thinking` ↔ `skipped` changes never notify in membership-only mode.
- Ride-level notification disabling and creator self-suppression continue to work.
- Existing users default to `all` without migration.
- English and Russian UI/help/notification text explain the behavior accurately.
- Focused tests and `./run-tests.sh --mode basic` pass.

## Resolved Product Decisions

- Keep per-ride notification enablement.
- Default the user level to `all`.
- Treat every `joined` → other-state transition as relevant.
- Keep the 20-second debounce duration and define both levels through the aggregate initial-to-final transition.
- Read the live preference at delivery time.
- Use the UI labels “All participation changes” and “Joins and leaves only,” localized into English and Russian.
- Reuse the existing target-state notification templates without new “left” wording.
- Keep the existing notification footer unchanged.

There are no open product questions in this specification.
