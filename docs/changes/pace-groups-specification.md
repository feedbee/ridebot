# Pace Groups

Status: implemented and independently reviewed. Date: 2026-10-03.

## Objective

Allow a ride to contain groups with different average moving and/or cruising
speeds. People select a group independently of participation status. Announcements
and the full participant list show group membership and counts, including people
without a selection. Support parameter commands, wizard, AI, Strava import,
editing, and duplication.

English label: “Pace Groups”. Russian label: “Группы по скорости”.
Individual groups are named A, B, C, D, E; no custom names.

## Product Rules

- Maximum five groups.
- Groups exist only when at least one speed field has two or more values.
- Group count is the maximum length of the two speed lists.
- Input order determines letters. Do not sort or enforce fastest-first ordering.
- A single value is common to the whole ride, including every group.
- When both fields contain lists, match their elements by position.
- Different list lengths are valid. Omit missing characteristics for later groups;
  do not infer, repeat, or calculate missing values.
- Both `joined` and `thinking` people may select a group. In approval mode,
  `thinking` means a pending application and supports selection too.
- Selection is optional; display unassigned people under “Without a Group” /
  “Без группы”.
- Changing groups does not require approval, even after an application is accepted.
- No reset button. Selecting the current group is an idempotent no-op.
- Skipping, withdrawing, or rejecting an application clears the selection.
- Preserve selection when moving between `thinking` and `joined`, including acceptance.
- Changing a group's speed preserves its people. New groups start empty.
- Removing a group clears its people's selection. Reintroducing the letter does
  not restore old selections. Removing all groups restores the ordinary interface.
- Group changes send no organizer notifications and do not change Telegram membership.
- Participant capacity remains ride-wide. Selecting a group consumes no extra place.

## Input and Validation

### Parameter Commands

Repeat `speed:` and `cruisingSpeed:` just like existing repeated `route:` entries:

```text
/newride
title: Sunday Ride
when: tomorrow 10:00
speed: 20-28
cruisingSpeed: 25-28
cruisingSpeed: 29-32
cruisingSpeed: 33+
```

This creates A–C with common average speed and individual cruising speeds.
One occurrence retains the existing string contract. Repeated occurrences become
an ordered string array, including when other parameters occur between them.
Other parameters retain their existing duplicate-key behavior.

### Wizard

Each speed step accepts up to five nonempty lines. Parse every line using exactly
the existing single-speed grammar. Explain that one line is a common speed and
multiple lines define A–E. Preserve lists in prefill, back navigation, editing,
clearing, previews, and confirmation. Ignore blank lines in multiline text.

### AI

Both speed parameters accept a string or an array of strings:

```json
{"speed":"20-28","cruisingSpeed":["25-28","29-32","33+"]}
```

Update extraction instructions, response processing, preview, and save. Preserve
explicit input order. Do not invent groups or derive one speed characteristic
from another. Use the shared parser for preview and persistence. Invalid arrays
must fail validation; do not silently discard invalid elements or truncate them.

### Shared Contract

- Keep `parseSpeedInput` grammar: `25`, `~25`, `25-28`, `25+`, `25-`, `-28`,
  including existing decimal and bound behavior.
- A shared list wrapper handles count, normalization, and error position; each
  individual value is parsed by the existing single-speed parser.
- A one-element array is equivalent to a scalar and creates no groups.
- Invalid input rejects the whole field without partial persistence. Localized
  errors identify the field and offending line/element. More than five manual or
  AI values produces a localized limit error.
- Empty structured arrays and empty/nonstring array elements are invalid.
- In update mode, a single `-` clears the entire field, including its list.
  `-` inside a multi-element list is invalid; sparse positions are unsupported.
- A supplied field replaces that entire characteristic; an omitted field remains
  unchanged. Scalars replace lists and lists replace scalars.

## Strava Import

Replace the current aggregation of speed-based Pace Groups into one cruising
range with individual cruising speeds.

- Source is `event.pace_groups`, with the existing fallback to the first upcoming
  occurrence. Preserve source order and consider only the first five source
  entries. Ignore later entries silently, without warning or error.
- For each entry use existing center (`pace` / `target_pace_metric`) and half-width
  (`range` / `pace_range_metric`, default zero). Bounds are rounded center minus
  and plus half-width.
- Skip malformed entries without crashing or producing invalid bounds. Do not
  pull in the sixth entry to replace an invalid entry in the first five.
- Two or more usable values create groups; one creates ordinary cruising speed;
  none creates no speed/groups. Use A–E rather than imported custom group names.
- Apply only to speed in km/h. Pace in min/km remains additional information;
  pace-to-speed conversion is out of scope.
- Avoid duplicating structured speed groups in an automatically generated
  `Pace groups:` note. Preserve the source event URL, original description, and
  pace-based group notes.

## Presentation and Interaction

Single-value fields retain their current presentation. List fields show their
speed heading and lettered values; only display values supplied for that field.
Show common speeds once rather than repeating them inside every group.

```text
Average Moving Speed: 20–28 km/h
Cruising Speed:
A: 25–28 km/h
B: 29–32 km/h
C: 33+ km/h

Joined (7):
A (3): …
B (2): …
C (0): —
Without a Group (2): …
```

- Insert one row of A–E buttons immediately after the participation status row.
  In approval mode it follows Apply / Not Participating.
- The announcement keyboard is shared; no per-user highlighting is needed.
- Group `joined` and `thinking` independently. Keep existing Accepted / Applications
  labels in approval mode. Keep `skipped` as an ordinary ungrouped list.
- In each nonempty status section display all existing groups, including empty
  ones, with accurate counts. Display the unassigned row only when nonempty.
- An entirely empty status section retains its existing empty-state message.
- The full participant list uses the same grouping and counts without truncating
  names. Announcements keep existing protection against excessive name lists;
  counts always describe the complete membership.
- Creation/edit previews, wizard confirmations, and all supported announcement
  formats display speed lists consistently.
- Group changes propagate through the existing announcement update service to all
  tracked messages. Full lists are generated from current state; previously sent
  static lists are not automatically edited.

### Feedback

Keep existing successful join/thinking/application feedback. If groups exist and
selection is missing, append “Choose a pace group” / “Выберите группу по скорости”.
After application acceptance, append the same hint to existing applicant feedback
when selection is missing.

A successful selection identifies the group; a repeated selection says it is
already selected. With no participation or `skipped`, explain that the person
must first join, select Thinking, or apply, using wording appropriate to approval
mode. A group button never registers participation automatically. A stale button
for a removed group returns a clear error without mutation. Existing missing,
cancelled, and archived ride restrictions also apply to group selection.

New labels, help, prompts, and errors support both existing locales, EN and RU.
Already-sent moderation messages are not a second live group list: current choices
are available in announcements and full application lists. Do not add organizer
notifications or edit moderation messages on every group change.

## Data Model and Compatibility

Retain existing scalar fields and add optional `speedGroups` and
`cruisingSpeedGroups` arrays of `{ min: number|null, max: number|null }`.
Use optional `Participant.paceGroup` containing a letter A–E.

```js
// Common average speed, with three cruising-speed groups.
speedMin: 20,
speedMax: 28,
cruisingSpeedGroups: [
  { min: 25, max: 28 },
  { min: 29, max: 32 },
  { min: 33, max: null }
]
// In a current participant record: paceGroup: 'A'.
```

Scalar speed has no group list (absent or empty). List speed clears its scalar
bounds. Never persist competing scalar/list sources for the same characteristic.
Normalize one-element arrays to scalar bounds. Derive letters and group count
from lists; do not introduce separate group IDs, collections, or stored counts.
Store the selection in the current participation record, not a parallel mapping.

Old rides continue to work without a migration. Missing selection means unassigned
when groups exist. Update schema, typedefs, and manual document mapping so all new
fields survive write/read. Pace groups are unrelated to `ride.groupId`, the
existing attached Telegram chat.

## Services, Persistence, and Reliability

The participation service owns group-selection rules. Telegram handlers translate
callbacks, call the service, propagate announcements, and render feedback.

- A selection changes only the current person's `paceGroup`, retaining status,
  profile, participation creation time, and participant ordering.
- Preserve selections atomically across allowed status transitions; clear them
  on refusal/rejection.
- Reuse existing per-ride/user operation serialization.
- Storage conditionally updates only while the person is still joined/thinking,
  the ride allows participation, and the group exists in current stored data.
  A service-level precheck alone is insufficient.
- Updating speed lists and clearing removed selections must be consistent in
  storage, without replacing participant arrays from a stale service snapshot.
- Memory and Mongo have identical behavior. Concurrent selection, withdrawal,
  moderation, and speed editing must not resurrect removed choices or lose people.
- Selection does not trigger participation notifications, Telegram membership,
  application recreation, or status changes.
- Telegram edit failure does not roll back a persisted selection; retain existing
  announcement propagation failure handling.

## Editing and Duplication

Add both arrays to editable content fields, prefill, DTOs, previews, and saves.
Partial changes preserve the other speed characteristic. Letters are positional:
reordering speeds does not move people between letters. Removing a middle speed
row shifts later speeds, while people remain at existing letters; only letters
outside the new group count are cleared. Duplication copies speeds, order, and
existing settings policy, but never people or selections.

## Scope, Structure, and Code Style

Follow `docs/layer-responsibilities.md`, `docs/coding-preferences.md`, and
`docs/testing-conventions.md`. Reuse single-speed parsing, keep business logic out
of Telegram handlers, and document new methods with typed JSDoc. Apply the rules
to all save paths. The schema extension described here is within authorized scope.

No custom group names, sorting, enforced selection, group capacities/leaders,
separate chats, new moderation, change notifications, dependencies, historical
migration, or unrelated refactoring. Do not edit landed historical specifications.

Stack remains JavaScript ES modules, grammY, Mongoose/MongoDB, MemoryStorage, Jest,
and the existing in-process scenario harness. Primary affected modules:
`src/utils/speed-utils.js`, `RideParamsHelper.js`, `FieldProcessor.js`,
`strava-event-parser.js`; `src/services/RideService.js`, `RideParticipationService.js`,
`AiRideService.js`; `src/storage/`; `src/wizard/`; `src/formatters/MessageFormatter.js`;
creation/edit/duplicate/AI/participation/list handlers; `src/core/Bot.js` callback
wiring; `src/i18n/locales/`. Reusable group rules belong outside Telegram handlers.

## Implementation Plan

1. Shared list parser and repeated parameters; grammar, limit, error, compatibility tests.
2. Optional storage fields, mapping, speed replacement, atomic selection cleanup;
   service and storage contract tests.
3. Parameter/wizard/AI/Strava create/edit/duplicate paths and consistent previews;
   round-trip and partial-update tests.
4. Grouped presentation, callbacks, participation service, localization,
   propagation, selection preservation/clearing.
5. Scenario verification, Telegram E2E smoke review, user help and living docs,
   independent context-free quality review, and fixes for review findings.

## Testing and Acceptance

Unit/component coverage: existing scalar grammar; scalar/singleton/multiline
normalization; malformed elements and >5 rejection without partial persistence;
common speed plus groups; equal/unequal lists; A–E order; clearing/replacement;
ordinary/grouped/truncated/full formatting with correct counts; Strava zero/one/
multiple/>5 groups, occurrence fallback, rounding, malformed/pace-based data;
legacy/new storage round trips; no status/capacity/notification/membership side
effects; no-op/stale/missing/archived/cancelled callbacks; removal/reintroduction;
concurrent independent operations.

Real command/callback scenarios with MemoryStorage:

- Parameters → join → A → B → skip → rejoin without selection.
- Multiline wizard → preview → save → edit.
- AI arrays → matching preview/save; invalid lists do not persist.
- Thinking → select → join preserves selection.
- Apply → select → accept preserves selection → switch without new approval;
  rejection/withdrawal clears selection.
- Speed/group-count editing, duplication, multiple tracked announcements, and
  Telegram edit failure without losing the choice.
- Ride-wide capacity still applies to direct join and acceptance.

Devcontainer-first commands:

```sh
./scripts/devcontainer-exec.sh ./run-tests.sh --mode basic
# Manual smoke with a configured Telegram environment, after implementation:
./scripts/devcontainer-exec.sh npm run e2e:run
# Development bot if needed:
./scripts/devcontainer-exec.sh npm run dev
```

Do not run Mongo mode without an explicit user request. Add/update Mongo contract
coverage where persistence changes and report any checks requiring unavailable
infrastructure. Prefer behavioral tests over assertions that mirror implementation.

Acceptance: all entry points implement the same rules; ordinary rides retain
appearance and behavior; basic tests pass; speeds and selections survive reads;
the five-group limit holds; selection introduces no notifications or participation
side effects; the independent review has no unresolved actionable findings.
