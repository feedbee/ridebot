# Specification: Ride And User Settings

## Overview

This change introduces a first-class settings model for both rides and users.

The product goal is to stop exposing ride settings inside the ride creation and edit wizards, while still allowing:

- clean defaults for future rides at the user level
- explicit settings per ride
- power-user control through text-based update flows
- future expansion to several independent settings without redesigning the UX each time

The first implemented setting in this change is:

- `notifyParticipation`

This setting replaces the current legacy ride-level notification field and becomes the foundation for future ride settings such as ride language, participant reminders, and ride sharing permissions.

---

## Goals

- Introduce a persisted user entity with ride-default settings.
- Introduce a dedicated `ride.settings` object instead of storing settings as standalone ride fields.
- Remove ride settings from the create/update/duplicate wizard UX.
- Add a single private `/settings` command that can manage either:
  - user defaults
  - settings of a specific ride
- Keep power-user editing of ride settings available from text-based `/updateride` input.
- Prepare `/airide` to understand ride settings in free-form language and map them into the same structured model.
- Migrate existing ride notification data into the new settings model with no runtime fallback to the legacy field.

## Non-Goals

- Do not introduce participant-level opt-outs for reminders or notifications.
- Do not keep `notifyOnParticipation` as a supported storage field after migration.
- Do not keep ride settings visible in the ride wizard.
- Do not add a "reset to default" action for ride settings in v1.
- Do not redesign unrelated ride lifecycle flows.

---

## Product Model

### Principles

1. User settings provide defaults only for future rides.
2. Each new ride stores an explicit snapshot of settings at creation time.
3. Existing rides do not consult current user defaults retroactively.
4. Effective settings for a ride should always be readable directly from the ride after migration.

### Terminology

- **System defaults**: hardcoded application defaults used when no user record or user default exists.
- **User ride defaults**: default values for future rides, stored under `user.settings.rideDefaults`.
- **Ride settings**: explicit snapshot stored under `ride.settings`.

---

## Data Model

### Ride

Add a dedicated settings object:

```js
ride.settings = {
  notifyParticipation: true
}
```

The canonical key for this change is:

- `ride.settings.notifyParticipation`

Legacy standalone notification fields should be removed from application logic after migration.

### User

Introduce a persisted user entity.

Suggested shape:

```js
user = {
  userId,
  username,
  firstName,
  lastName,
  settings: {
    rideDefaults: {
      notifyParticipation: true
    }
  },
  createdAt,
  updatedAt
}
```

The canonical key for the first user-level default is:

- `user.settings.rideDefaults.notifyParticipation`

### System Defaults

Introduce a single source of truth for built-in defaults, for example:

```js
rideSettingsSystemDefaults = {
  notifyParticipation: true
}
```

System defaults are used when:

- a user opens `/settings` without an existing user record
- a legacy ride is being backfilled during migration
- a new user record must be created before the first ride is created

---

## Effective Value Rules

### User defaults

Read user defaults as:

```js
user.settings.rideDefaults ?? rideSettingsSystemDefaults
```

If the user record does not exist, `/settings` should display system defaults without creating a record.

### Ride settings

After migration, ride logic should read:

```js
ride.settings.notifyParticipation
```

There should be no runtime business fallback to the removed legacy field.

### Snapshot Semantics

When a ride is created, its `ride.settings` object is populated from:

1. explicit create-time settings if provided by the entry point
2. otherwise `user.settings.rideDefaults`
3. otherwise system defaults if the user record does not yet exist and must be materialized

Later changes to `user.settings.rideDefaults` do not affect existing rides.

---

## User Record Materialization Rules

The system should avoid creating user records for passive users.

### Do not create a user record

- on arbitrary incoming messages
- on `/start`
- on `/help`
- on read-only `/settings` access

### Create or upsert a user record only when:

1. the user creates a ride
2. the user changes their user defaults through `/settings`

### `/settings` read behavior without a user record

If the user has no record:

- show effective system defaults
- allow the UI to behave normally
- create the record only when the user actually changes a default

---

## User Experience

### Entry Points

Use a single private command:

- `/settings`

This command has two scopes.

#### User scope

Opened by:

- `/settings`

This screen manages:

- `user.settings.rideDefaults.*`

#### Ride scope

Opened by:

- `/settings #rideId`
- `/settings` as a reply to a ride message
- the existing owner-only `Settings` button in a creator's private ride copy

This screen manages:

- `ride.settings.*`

### UI Style

Do not use the linear ride wizard for settings.

Use a menu-like inline keyboard UI with:

- a title describing the current scope
- a list of settings with current values
- explicit toggle buttons
- navigation buttons such as Back or Close if needed

This should be the same reusable settings UI for both scopes, with only the scope and storage target changing.

### V1 Scope

In this change, both user and ride settings screens need only one setting:

- `notifyParticipation`

### No Reset Action In V1

Ride settings should not offer:

- "reset to user default"
- "reset to system default"

The ride setting is an explicit snapshot value, not a live override against user defaults.

---

## Ride Creation And Duplication Rules

### New Ride Creation

All ride-creation entry points must populate `ride.settings` explicitly.

This includes:

- `/newride` parameter mode
- create wizard completion
- `/airide` create flow
- `/fromstrava`
- duplication when it results in a new ride

### Duplicate Semantics

When duplicating a ride:

- duplicating your own ride copies settings from the original ride
- duplicating someone else's ride uses your user defaults instead

This rule applies consistently across both:

- text-based duplication
- duplicate wizard flow

Because ride settings are removed from the wizard UI, duplicate flows must carry the chosen snapshot internally even when the user does not see settings during the wizard.

---

## Wizard Changes

Ride settings should no longer appear in the ride wizard.

This change removes the participation notification step from:

- create wizard
- update wizard
- duplicate wizard

Implications:

- `wizardFieldConfig` no longer includes the notification field
- confirmation screens no longer show that setting
- update and duplicate prefill objects no longer need to expose the setting to the wizard UI

The wizard remains responsible only for ride content, not ride settings.

---

## Text-Based Command Changes

### `/updateride`

Text-based `/updateride` should continue supporting ride-setting changes.

Canonical syntax:

```text
/updateride #abc123
settings.notifyParticipation: no
```

This preserves the power-user ability to update ride content and ride settings in one message.

### `/newride`

The primary UX for settings is user defaults plus `/settings`, not settings during create flow.

New ride creation should not require users to specify settings manually.

If text-based create support for `settings.*` is implemented, it should map directly into `ride.settings.*`. If it is not implemented in the first delivery, the spec still requires explicit ride settings to be written using user defaults at creation time.

### `/airide`

`/airide` must support ride settings in free-form language, not only explicit `settings.*` syntax.

Examples of intended interpretation:

- "create the ride without participation notifications"
- "same ride but do not notify me when people join or leave"

Internally, the AI flow should map the interpreted result into the same structured model:

```js
{
  settings: {
    notifyParticipation: false
  }
}
```

### Param Parsing Requirement

The current parameter parser only supports simple word keys. It must be expanded to support dotted keys such as:

- `settings.notifyParticipation`

The parsed output should preserve the nested structure or provide a deterministic flattening convention that service code can map into nested settings.

---

## Notification Behavior

Creator participation notifications should now consult:

- `ride.settings.notifyParticipation`

instead of the removed legacy field.

The product meaning remains the same:

- when enabled, the creator receives a private notification about participation changes
- when disabled, the creator does not receive these notifications for that ride

This change does not introduce participant-level unsubscribe controls.

If a user wants to stop notifications for a ride, they must disable the setting for that ride.

---

## Future Settings Prepared By This Design

The design should scale cleanly to several more settings, for example:

- `ride.settings.language`
- `ride.settings.participantRemindersEnabled`
- `ride.settings.allowParticipantSharing`

Important future rule already agreed for language:

- ride language belongs to the ride, not to the user UI preference
- changing a user's own defaults later must not retroactively rewrite the language of existing ride messages

This specification only implements `notifyParticipation`, but the object structure should be designed for 3-5 independent settings.

---

## Migration

### Migration Required

This change requires a real data migration.

Runtime backward compatibility for the removed legacy ride notification field is not desired.

### Legacy Source

Existing rides currently store notification state in the legacy standalone field used by the current implementation.

### Migration Target

For every existing ride, write:

```js
ride.settings.notifyParticipation = <resolved value>
```

### Migration Rules

For each ride:

1. if the legacy notification field is explicitly present, copy its value into `ride.settings.notifyParticipation`
2. if the legacy field is missing, set `ride.settings.notifyParticipation` to the system default
3. remove the legacy field from stored data

### Post-Migration Rule

After migration:

- application code reads only `ride.settings.*`
- application code writes only `ride.settings.*`

No business path should continue depending on the removed legacy field.

---

## Architecture Notes

### Services

The settings logic should stay out of Telegram-specific handlers.

Suggested responsibilities:

- a `UserService` or `SettingsService` owns user record read/create/update for defaults
- `RideService` owns applying defaults during ride creation and duplicate flows
- a dedicated settings-oriented command handler owns `/settings` transport behavior
- formatter and command code render the settings UI, but business resolution lives in services/helpers

### Suggested Helper Concepts

- `getSystemRideSettingsDefaults()`
- `getEffectiveUserRideDefaults(user)`
- `buildRideSettingsSnapshot({ explicitSettings, userDefaults, systemDefaults })`

### Command Layer

Handlers should:

- resolve whether `/settings` is in user scope or ride scope
- load the relevant entity
- enforce ownership for ride scope
- delegate mutation decisions to services
- choose reply vs callback response transport

Handlers should not:

- duplicate default-resolution logic
- decide migration fallbacks
- embed storage-specific branching

---

## Testing Strategy

Add or update tests in these families.

### Service Tests

- creating a ride with no user record materializes the user and applies system defaults
- creating a ride with existing user defaults snapshots those defaults into the ride
- changing user defaults does not affect existing rides
- duplicating your own ride copies original ride settings
- duplicating another user's ride uses your user defaults

### Command And Settings UI Tests

- `/settings` with no user record shows effective system defaults
- the first user-default change creates the user record
- `/settings #rideId` loads ride scope
- `/settings` as reply to ride message loads ride scope
- non-creators cannot change another user's ride settings
- owner-only settings callback opens the same ride scope

### Wizard Tests

- create wizard no longer includes the notification step
- update wizard no longer includes the notification step
- duplicate wizard no longer includes the notification step

### Param Parsing Tests

- dotted parameter keys are parsed correctly
- `/updateride` updates `ride.settings.notifyParticipation`
- old flat notification keys are not treated as canonical settings input if the implementation chooses a clean break

### Notification Tests

- creator notifications use `ride.settings.notifyParticipation`
- migrated rides continue to behave correctly after the old field is removed

### Scenario Integration Tests

- create a ride, open `/settings`, change user defaults, create another ride, and verify snapshot behavior
- update a ride setting from `/settings` and verify subsequent participation changes respect it
- duplicate own ride vs duplicate foreign ride and verify different settings source behavior

Follow `docs/testing-conventions.md` as the baseline for test level selection.

---

## Files Expected To Change In The Implementation Phase

| File | Type | Change |
|------|------|--------|
| `docs/changes/ride-and-user-settings-specification.md` | New | This document |
| `src/storage/interface.js` | Modified | Add `ride.settings`; add a persisted user entity contract and user access methods |
| `src/storage/mongodb.js` | Modified | Add user schema; add `ride.settings`; implement migration support and user storage methods |
| `src/storage/memory.js` | Modified | Mirror the new ride and user storage shape |
| `src/services/RideService.js` | Modified | Apply user defaults when creating rides; support duplicate semantics |
| `src/services/NotificationService.js` | Modified | Read `ride.settings.notifyParticipation` |
| `src/commands/RideSettingsCommandHandler.js` | Reworked | Replace placeholder behavior with actual settings flows |
| `src/core/Bot.js` | Modified | Register `/settings`; wire the settings handler and related services |
| `src/utils/RideParamsHelper.js` | Modified | Support dotted settings keys |
| `src/utils/FieldProcessor.js` | Modified | Map `settings.*` params into nested ride settings |
| `src/wizard/wizardFieldConfig.js` | Modified | Remove the notification field from wizard flow |
| `src/wizard/RideWizard.js` | Modified | Remove notification-step handling |
| `src/i18n/locales/en.js` | Modified | Add `/settings` labels, prompts, button text, and updated notification help text |
| `src/i18n/locales/ru.js` | Modified | Same keys in Russian |
| `src/__tests__/services/*` | Modified/New | Cover settings defaults, snapshot rules, duplication, migration behavior |
| `src/__tests__/commands/*` | Modified/New | Cover `/settings` user scope, ride scope, ownership, and callbacks |
| `src/__tests__/wizard/*` | Modified | Remove notify-step assumptions and cover the new wizard shape |
| `src/__tests__/integration/*` | Modified/New | Add end-to-end in-process settings scenarios |

---

## Success Criteria

- Rides store settings under `ride.settings`.
- Users can manage ride defaults through `/settings`.
- Ride settings are no longer shown in create/update/duplicate wizards.
- Ride creators can change ride settings through `/settings #rideId`, reply-to-ride `/settings`, or the owner-only settings button.
- Text-based `/updateride` can update ride settings with `settings.*` syntax.
- `/airide` can express the same setting in free-form language and persist it into `ride.settings`.
- Existing rides are migrated so the old standalone notification field is no longer used by business logic.
- Future changes can add several more settings without redesigning the settings UX.

---

## Implementation Plan

### Overview

Implementation should proceed in dependency order:

1. introduce the settings data model and storage support
2. migrate legacy ride notification data
3. teach ride creation and duplication flows to use user defaults and explicit ride snapshots
4. add `/settings` user and ride scopes
5. remove settings from the wizard
6. add text-based and AI-based settings editing
7. rebalance tests around the new behavior

This order keeps the system working after each phase and avoids building UI on top of unfinished storage or service contracts.

### Architecture Decisions

- Keep `ride.settings` embedded in the ride document rather than creating a separate ride-settings collection.
- Introduce a persisted user entity only for users who create rides or actually change defaults.
- Use explicit ride settings snapshots rather than live inheritance from user defaults.
- Keep ride settings out of wizard UX, but preserve power-user editing through text and AI entry points.
- Use one `/settings` command for both scopes instead of separate user-settings and ride-settings commands.

### Dependency Graph

```text
system defaults + storage contracts
        │
        ├── ride/user storage implementation
        │        │
        │        ├── migration
        │        ├── RideService snapshot logic
        │        │        │
        │        │        ├── /settings user scope
        │        │        ├── /settings ride scope
        │        │        ├── duplicate semantics
        │        │        └── notification service read path
        │        │
        │        ├── wizard cleanup
        │        ├── param-mode settings updates
        │        └── /airide settings mapping
        │
        └── scenario and service tests
```

### Verification Baseline

Unless a narrower test target is enough for an intermediate task, use:

- `./run-tests.sh --mode basic`

For focused iterations, prefer the smallest relevant Jest subset first, then run the basic suite at each checkpoint.

---

## Task Breakdown

## Task 1: Add shared settings defaults and storage contracts

**Description:** Introduce the canonical settings shape in interfaces and shared helpers without changing user-visible behavior yet. This task establishes the source of truth for system defaults and the user entity contract that later tasks build upon.

**Acceptance criteria:**
- [ ] A shared helper or module exposes system ride-settings defaults.
- [ ] Storage contracts define `ride.settings` and the persisted user entity shape.
- [ ] Storage contracts define the minimum user read/write methods needed by later tasks.

**Verification:**
- [ ] Interface-level tests or type-oriented tests are updated where they exist.
- [ ] Build-level import checks remain clean.

**Dependencies:** None

**Files likely touched:**
- `src/storage/interface.js`
- `src/models/` or `src/utils/` settings defaults helper
- `docs/changes/ride-and-user-settings-specification.md`

**Estimated scope:** Small

## Task 2: Implement storage backends and ride migration support

**Description:** Add the new user storage shape and `ride.settings` persistence to both storage backends, then add the migration needed to move the legacy ride notification field into the new settings object.

**Acceptance criteria:**
- [ ] MongoDB storage persists `ride.settings.notifyParticipation`.
- [ ] MongoDB storage persists the user entity and user defaults.
- [ ] Memory storage mirrors the new shape for tests and local flows.
- [ ] A migration backfills legacy ride notification values into `ride.settings` and removes the legacy field.

**Verification:**
- [ ] Storage tests cover user create/update/read and migrated ride reads.
- [ ] Migration tests or migration-oriented storage tests cover legacy rides with and without the old field.

**Dependencies:** Task 1

**Files likely touched:**
- `src/storage/mongodb.js`
- `src/storage/memory.js`
- `src/migrations/*`
- `src/__tests__/storage/*`

**Estimated scope:** Medium

## Task 3: Apply user defaults and ride snapshot logic in RideService

**Description:** Teach ride creation and duplication flows to materialize users when required, resolve effective defaults, and persist explicit `ride.settings` snapshots on every new ride.

**Acceptance criteria:**
- [ ] Creating a ride with no user record creates the record and snapshots system defaults.
- [ ] Creating a ride with user defaults snapshots those defaults into `ride.settings`.
- [ ] Duplicating your own ride copies original ride settings.
- [ ] Duplicating another user's ride uses your user defaults.

**Verification:**
- [ ] `RideService` tests cover creation, duplication, and snapshot semantics.
- [ ] Focused tests pass for new ride and duplicate flows.

**Dependencies:** Task 2

**Files likely touched:**
- `src/services/RideService.js`
- `src/__tests__/services/ride-service.test.js`
- any new helper/service file for user defaults resolution

**Estimated scope:** Medium

## Checkpoint: Foundation Complete

- [ ] Storage and service foundations are in place.
- [ ] Legacy ride notification data has a migration path.
- [ ] New rides can persist explicit `ride.settings`.
- [ ] `./run-tests.sh --mode basic` passes before moving into UX work.

## Task 4: Implement `/settings` user scope

**Description:** Replace the placeholder settings behavior with a real user-defaults screen that works even when no user record exists yet. This task covers only `/settings` without ride scope.

**Acceptance criteria:**
- [ ] `/settings` opens a user-defaults screen in private chat.
- [ ] If no user record exists, the screen shows effective system defaults without creating a record.
- [ ] The first change to a user default creates the user record and persists the new value.
- [ ] Relevant labels and prompts are localized.

**Verification:**
- [ ] Command-handler tests cover read-without-record and first-change materialization.
- [ ] Scenario coverage verifies the command path in private chat.

**Dependencies:** Task 3

**Files likely touched:**
- `src/commands/RideSettingsCommandHandler.js`
- `src/core/Bot.js`
- `src/formatters/*` or settings-specific formatter
- `src/i18n/locales/en.js`
- `src/i18n/locales/ru.js`
- `src/__tests__/commands/*`

**Estimated scope:** Medium

## Task 5: Implement ride scope for `/settings`

**Description:** Extend the same settings UI to support ride-specific settings via `#rideId`, reply-to-ride, and the existing owner-only callback button.

**Acceptance criteria:**
- [ ] `/settings #rideId` opens ride scope.
- [ ] `/settings` as a reply to a ride message opens ride scope.
- [ ] The existing owner-only `Settings` button opens the same ride scope.
- [ ] Non-creators cannot open or modify ride settings.

**Verification:**
- [ ] Command tests cover all ride-scope entry points and creator checks.
- [ ] Scenario integration covers at least one ride-scope update flow end-to-end.

**Dependencies:** Task 4

**Files likely touched:**
- `src/commands/RideSettingsCommandHandler.js`
- `src/commands/BaseCommandHandler.js`
- `src/core/Bot.js`
- `src/__tests__/commands/*`
- `src/__tests__/integration/*`

**Estimated scope:** Medium

## Task 6: Remove settings from the ride wizard

**Description:** Remove the legacy notification step and any wizard-state assumptions that settings belong in ride-content editing flows.

**Acceptance criteria:**
- [ ] Create wizard no longer shows the notification step.
- [ ] Update wizard no longer shows the notification step.
- [ ] Duplicate wizard no longer shows the notification step.
- [ ] Confirmation previews no longer include the removed setting row.

**Verification:**
- [ ] Wizard tests are updated for flow order and preview content.
- [ ] No wizard tests still depend on the removed setting step.

**Dependencies:** Task 3

**Files likely touched:**
- `src/wizard/wizardFieldConfig.js`
- `src/wizard/RideWizard.js`
- `src/commands/UpdateRideCommandHandler.js`
- `src/commands/DuplicateRideCommandHandler.js`
- `src/__tests__/wizard/*`

**Estimated scope:** Medium

## Checkpoint: Core UX Complete

- [ ] `/settings` works in both scopes.
- [ ] Wizard flows are cleanly separated from settings.
- [ ] Ride settings can be changed from both command and callback entry points.
- [ ] `./run-tests.sh --mode basic` passes before moving into text and AI integration.

## Task 7: Support dotted settings keys in param-mode

**Description:** Extend parameter parsing and field processing so `/updateride` can update ride settings with the canonical `settings.*` syntax.

**Acceptance criteria:**
- [ ] Parameter parsing accepts dotted keys such as `settings.notifyParticipation`.
- [ ] Parsed settings are mapped into the nested `ride.settings` object.
- [ ] `/updateride` can update the ride setting in one message alongside normal ride content fields.

**Verification:**
- [ ] Parser tests cover dotted keys.
- [ ] Command or service tests cover ride-setting updates through `/updateride`.

**Dependencies:** Task 3

**Files likely touched:**
- `src/utils/RideParamsHelper.js`
- `src/utils/FieldProcessor.js`
- `src/services/RideService.js`
- `src/commands/UpdateRideCommandHandler.js`
- `src/__tests__/utils/*`
- `src/__tests__/commands/*`

**Estimated scope:** Small

## Task 8: Add settings understanding to `/airide`

**Description:** Update AI create/update flows so free-form requests about ride notifications are extracted into the same structured settings object used everywhere else.

**Acceptance criteria:**
- [ ] Free-form AI requests can disable or enable participation-change notifications.
- [ ] AI output maps into `settings.notifyParticipation`.
- [ ] Saved rides persist the interpreted setting into `ride.settings`.

**Verification:**
- [ ] AI service tests cover settings extraction or output mapping.
- [ ] Command-level AI tests cover at least one settings-related prompt.

**Dependencies:** Task 3

**Files likely touched:**
- `src/services/AiRideService.js`
- `src/commands/AiRideCommandHandler.js`
- AI-related prompt/schema files if present
- `src/__tests__/services/ai-ride-service.test.js`
- `src/__tests__/commands/ai-ride-command-handler.test.js`

**Estimated scope:** Small

## Task 9: Switch notification behavior to the new ride setting and finalize integration coverage

**Description:** Finish the transition by removing business dependence on the old ride notification field, routing creator notifications through `ride.settings.notifyParticipation`, and covering the full end-to-end settings behavior.

**Acceptance criteria:**
- [ ] `NotificationService` reads only `ride.settings.notifyParticipation`.
- [ ] No business path still depends on the old standalone notification field.
- [ ] Integration tests cover snapshot behavior, `/settings`, ride-scope updates, and participation notifications after the setting changes.

**Verification:**
- [ ] Notification-service tests pass with only the new settings field.
- [ ] Scenario integration tests cover at least:
  - create ride with system defaults
  - change user defaults and create another ride
  - disable ride notifications and verify participation-change behavior
- [ ] `./run-tests.sh --mode basic` passes

**Dependencies:** Tasks 4, 5, 7, 8

**Files likely touched:**
- `src/services/NotificationService.js`
- `src/__tests__/services/notification-service.test.js`
- `src/__tests__/integration/*`
- any remaining cleanup sites that referenced the old field

**Estimated scope:** Medium

## Checkpoint: Ready For Implementation Review

- [ ] All tasks have landed in dependency order.
- [ ] The basic test suite passes.
- [ ] Wizard, `/settings`, `/updateride`, and `/airide` all use the same ride settings model.
- [ ] Legacy ride notification storage is fully migrated out of business logic.

---

## Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dotted-key parsing collides with existing param parsing assumptions | Medium | Add parser tests first and keep the mapping logic narrow to `settings.*` |
| Duplicate flows lose hidden settings after removing the wizard step | High | Cover own-vs-foreign duplicate semantics at the service layer before changing wizard UX |
| Migration removes the old field before all code paths are updated | High | Land migration and read-path cleanup behind focused tests, then run the basic suite before merging |
| `/settings` scope resolution becomes inconsistent between command, reply, and callback entry points | Medium | Reuse one handler/service path and add scenario coverage for each entry point |
| User records are created too eagerly and pollute storage | Medium | Keep materialization logic inside the explicit write paths only and test read-only `/settings` carefully |

## Open Implementation Notes

- The exact file split for settings UI formatting can stay flexible as long as handlers remain thin.
- If `RideService` starts accumulating too much settings logic, extracting a focused `SettingsService` is acceptable, but the storage and snapshot rules in this spec should remain unchanged.
- For the first rollout, documentation and user-facing help text should show the canonical `settings.notifyParticipation` syntax rather than the removed legacy notification field.

---

## Testing And Phase Gates

### Phase Discipline

Implementation should treat tests as phase gates, not only as a final validation step.

Each phase may temporarily break tests that still encode old product behavior, but every phase must end in a green, internally consistent state before the next phase begins.

Practical rule:

- temporary red inside a phase is acceptable
- green is required at the end of the phase
- `./run-tests.sh --mode basic` must pass at every phase checkpoint

### How To Use Existing Tests During A Phase

For each phase:

1. run the most relevant existing tests before code changes
2. identify which failures are expected under the new design
3. implement the phase
4. update or replace only the tests made obsolete by that phase
5. re-run focused tests first
6. finish with `./run-tests.sh --mode basic`

This keeps failures explainable instead of mixing expected product changes with accidental regressions.

### Reasonable vs Unreasonable Failures

Examples of reasonable failures during this change:

- tests still expect the removed notification wizard step
- tests still expect the placeholder "settings coming soon" behavior
- tests still reference the removed legacy ride notification field
- tests still expect old parameter syntax instead of `settings.*`

Examples of unreasonable failures:

- ownership checks stop working
- ride creation or duplication breaks for reasons unrelated to settings
- ride messages stop refreshing after state changes
- unrelated command flows fail without a clear dependency on the current phase

Unexpected failures should be treated as regressions, not as normal phase churn.

### Suggested Test Strategy By Phase

#### Foundation Phase

Focus on:

- storage tests
- migration tests
- `RideService` tests

Expectation:

- user-facing command flows should mostly stay stable
- any failures should be concentrated in storage or service behavior being actively changed

#### Settings UX Phase

Focus on:

- settings command-handler tests
- callback-flow tests
- wizard tests
- selected scenario tests

Expectation:

- tests covering the old placeholder settings behavior or the old wizard step will need to be rewritten

#### Integration Phase

Focus on:

- parser tests
- `/updateride` tests
- AI flow tests
- notification tests
- scenario integration tests

Expectation:

- remaining references to the old flat notification field should disappear here

### Mergeability Requirement

Not every phase has to deliver the full user-facing feature, but every phase must leave the codebase:

- working
- testable
- logically consistent
- safe to continue from in the next phase

Foundation work may be mostly infrastructural, but it should still be mergeable in principle once its checkpoint is green.
