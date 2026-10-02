# Specification: Archived Rides and Mutation Restrictions

## Status

Approved and implemented. This document defines the product behavior and implementation boundaries for archived rides.

## Objective

After a ride leaves its active period, prevent users from:

- changing participation state (`joined`, `thinking`, or `skipped`) in any direction;
- changing ride content through the `/updateride` wizard, `/updateride` parameters, `/airide`, or an import flow unless the same operation explicitly reschedules the ride to a valid future time;
- publishing or republishing the ride;
- cancelling or resuming the ride.

The owner must still be able to reschedule an archived ride and change other fields in that same operation. Archive state is computed at runtime and is not persisted.

## Terminology and Canonical Rule

### Archived ride

A ride is archived when the code-level interval has elapsed since its start:

```js
now >= ride.date + RIDE_ARCHIVE_AFTER_MS
```

The initial value is one hour:

```js
const RIDE_ARCHIVE_AFTER_HOURS = 1;
const RIDE_ARCHIVE_AFTER_MS = RIDE_ARCHIVE_AFTER_HOURS * 60 * 60 * 1000;
```

The boundary is inclusive: a ride becomes archived exactly one hour after its start. It is not archived at its start time or during the following hour. The interval remains a code constant in this version.

### Time and time zones

- User-entered local time continues to be parsed using `config.dateFormat.defaultTimezone`.
- Once parsed, `ride.date`, `now`, and proposed times are compared as absolute instants.
- Archive logic must not manually add or subtract time-zone offsets.
- One operation must use one snapshot of `now` for all boundary decisions.

### Single source of truth

The archive formula and content-mutation policy belong to one reusable service-level module. Command handlers, the wizard, AI, and import flows may call the policy but must not reproduce its calculation.

The policy surface is equivalent to:

```js
isRideArchived(ride, now = new Date())
isFutureRideDate(date, now = new Date())
```

Ride creation and content updates must enforce these rules immediately before storage mutation.

## Behavior

### Participation

`RideParticipationService` checks archive state after loading the ride and before reading or changing participation.

For an archived ride:

- `join`, `thinking`, and `skip` are rejected;
- repeating the current state returns the archive error instead of `already_in_state`;
- storage is not mutated;
- organizer notifications are not scheduled;
- attached-group membership is not changed;
- ride messages are not refreshed;
- the callback explains that the ride is archived and participation is closed.

Error precedence is: ride not found, ride archived, ride cancelled, already in state, success.

### Editing an archived ride

An archived ride may be edited only when the operation explicitly provides a new start time that passes strict future-time validation.

When valid, the new time and other fields from the same operation may be saved together. Admissibility is decided from the original ride and proposed final time before any write.

When the time is absent, unparseable, past, equal to `now`, or unchanged from the archived value:

- no fields are saved;
- ride messages are not refreshed;
- the user is told to reschedule the ride to a future time first.

The application use case must be atomic and must not save partial changes.

### Editing a non-archived ride

Existing behavior remains unchanged. During the first hour after the start, the owner may change other fields without changing the time. Any explicitly supplied new time must still be strictly in the future.

### Other lifecycle operations

| Operation | Archived ride behavior |
|---|---|
| Delete | Always allowed |
| Publish to a new destination | Rejected |
| Republish or share | Rejected |
| Open publication menu | Rejected with archive explanation |
| Cancel | Rejected |
| Resume | Rejected |
| Attach a group | Allowed |
| Detach a group | Allowed |
| Change `notifyParticipation` or `allowReposts` | Allowed |

Rejected operations stop before mutation, publication, or message refresh. Deletion, group operations, and ride settings are explicit administrative exceptions and do not require rescheduling.

## Input-Flow Behavior

### `/updateride` wizard

The wizard may open for an archived ride so the owner can reschedule it.

- The archived date is displayed for context.
- `keep` is rejected at the date step.
- A new future time unlocks later steps.
- Current or past time is rejected.
- Final confirmation repeats the service-level validation to protect against stale sessions and UI bypasses.
- Final saving must use the shared service path, not direct storage access.

### `/updateride` parameters

For an archived content update, `when` is required and must resolve to the future. A missing or invalid value rejects the entire command without a partial write. Other fields may be saved with a valid `when`. A settings-only update remains allowed without `when`.

### `/airide`

AI update mode follows the same contract:

- AI must extract a new `when` for an archived ride;
- the existing archived date is not a valid confirmation fallback;
- confirmation without a new `when` changes nothing;
- valid rescheduling uses the shared service path.

The dialog may open before the user supplies the new time.

### `/fromstrava`

Reimporting an existing ride is a user-content update and uses the shared lifecycle contract. An archived import is updated only when the imported event supplies a new future start time. Otherwise, the operation stops before fields or published messages are updated.

Creating through `/fromstrava` also uses shared final creation-time validation.

### Creating a ride

Every supported creation flow requires the start time to be strictly in the future at final save time.

- Past time and the current instant are rejected.
- Invalid operations create nothing.
- Validation runs at save time even if an earlier input or preview was valid.
- Long-lived wizard or AI sessions cannot create a ride whose time has already passed.

This is creation-time validity, not archive-state evaluation of a new object.

## Service and Technical Updates

Low-level `updateRide()` is also used for technical metadata such as tracked messages. Blocking every write to an archived ride would break synchronization and cleanup.

The implementation therefore distinguishes:

- user content mutation, which must pass lifecycle validation;
- internal technical mutation, which is not blocked solely because the ride is archived.

User content includes at least date, title, category, organizer, meeting point, routes, distance, duration, speed fields, and additional information. Shared application methods must protect wizard, parameter, AI, and import paths consistently.

## User-Facing Messages

Localized Russian and English messages are required for:

1. participation being closed;
2. editing requiring a future reschedule;
3. publication, cancellation, and resumption being unavailable.

Messages must explain what “archived” means and the user's next action. The displayed interval must come from the exported constant through translation parameters, not from an independent literal.

## Architecture Boundaries

### Always

- Compute archive state during the operation; never persist it.
- Keep the formula and content-admission rules in the service layer.
- Validate before mutations and side effects.
- Use shared content-save paths for wizard, parameters, AI, and imports.
- Keep localized Telegram feedback at the Telegram boundary.
- Test time boundaries with a fixed clock.

### Ask first

- Move the interval into environment configuration or user settings.
- Change the database schema or migrate existing rides.
- Hide buttons from already published messages instead of returning explanatory errors.

### Never in this version

- Run a worker that periodically writes archive state.
- Persist an `archived` field.
- Duplicate the archive formula in handlers or wizard configuration.
- Bypass service validation with a direct user-initiated storage update.

## Non-Goals

- Automatically changing old Telegram keyboards when a ride becomes archived.
- Adding a dedicated archived-rides list or visual treatment.
- Making the archive interval configurable.
- Changing calendar-export or planned-rides-list behavior.
- Blocking deletion, group attachment/detachment, or ride settings.

## Implementation Tasks

### 1. Shared lifecycle policy

Add the archive constant, pure archive calculation, future-date calculation, and centralized content validation.

Verify the millisecond before the boundary, the exact boundary, different ISO offsets, and injectable `now`.

### 2. Participation restriction

Apply the policy in `RideParticipationService`, return `ride_archived`, and map it to localized callback feedback. Verify no storage, notification, group, or message side effects.

### 3. Shared editing path

Make the application content-update path own validation and remove direct wizard storage writes. Verify atomic rescheduling and continued technical message updates.

### 4. Editing modes and creation

Connect wizard, parameters, AI, and Strava import to the shared contract. Revalidate future time at final creation. Verify that no input mode can bypass lifecycle validation.

### 5. Publication and ride state

Apply the policy to publication, republication, cancellation, and resumption while keeping deletion, group operations, and ride settings available.

## Verification Checkpoint

- `./run-tests.sh --mode basic` passes.
- Mongo mode is not run unless explicitly requested.
- No affected user flow writes content directly to storage.
- The archive formula appears once in runtime code.
- A focused test covers a configured time zone different from the system time zone.

## Expected Implementation Files

- `src/services/ride-lifecycle.js`
- `src/services/RideService.js`
- `src/services/RideParticipationService.js`
- `src/commands/ParticipationHandlers.js`
- `src/commands/AiRideCommandHandler.js`
- `src/commands/FromStravaCommandHandler.js`
- `src/commands/PublishRideCommandHandler.js`
- `src/commands/ShareRideCommandHandler.js`
- `src/commands/RideStateChangeHandler.js`
- `src/wizard/RideWizard.js`
- `src/i18n/locales/`
- corresponding service, command, wizard, and scenario tests

No storage schema change or data migration is required.

## Completion Criteria

- Runtime code has one explicit archive definition with an initial one-hour interval.
- Archive state is computed rather than stored.
- Participation cannot change on an archived ride.
- Archived content cannot change without an explicit future reschedule.
- Rescheduling permits other changes in the same operation.
- Archived rides cannot be published, republished, cancelled, or resumed.
- Archived rides may be deleted, attached to or detached from groups, and have settings changed.
- Wizard, parameters, AI, and Strava imports use shared rules without partial writes.
- Every creation flow requires a future time at final save.
- Errors explain archive state and the next action.
- Technical message-metadata maintenance remains available.
- The basic test suite passes.

## Open Questions

None.
