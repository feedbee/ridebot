# Specification: Average Moving Speed And Cruising Speed

## Status

Product behavior approved on 2026-08-27. This document specifies the change only; implementation is a separate phase.

## Objective

Let a ride describe two related but different speed characteristics:

1. **Average moving speed** — the expected average speed over the complete route while the group is moving, excluding stops.
2. **Cruising speed** — the speed the group normally maintains while riding on flat, fast sections.

The distinction addresses a recurring misunderstanding: riders may read an average speed as the speed the group will normally hold on the road, even though slower terrain, climbs, turns, and other route conditions reduce the route-wide average.

A ride may specify only average moving speed, only cruising speed, both, or neither. The values are independent and neither is derived from the other.

## Terminology And Labels

Use these exact user-facing labels:

| Meaning | English | Russian |
|---|---|---|
| Existing `speedMin` / `speedMax` fields | `Average moving speed` | `Средняя скорость движения` |
| New cruising-speed fields | `Cruising speed` | `Крейсерская скорость` |

Do not use `pace` as the general user-facing or internal name for the new field. In cycling integrations, including the existing Strava parser, `pace` can mean either speed or time per distance depending on the activity's `pace_type`. The canonical application name is `cruisingSpeed`.

The Russian help text must explain cruising speed as:

> Крейсерская скорость — скорость, которую группа обычно держит во время езды по ровным быстрым участкам.

The average-speed help text must explain:

> Средняя скорость движения — средняя скорость за весь маршрут без учёта остановок. Она учитывает подъёмы, спуски, повороты и медленные участки.

English help text must communicate the equivalent distinction.

## Non-Goals

- Do not calculate average moving speed from distance and duration.
- Do not derive either speed characteristic from the other.
- Do not require either speed characteristic when creating or updating a ride.
- Do not rename the existing persisted `speedMin` and `speedMax` fields.
- Do not migrate historical `speedMin` and `speedMax` values into cruising-speed fields.
- Do not add a separate speed unit setting; both characteristics continue to use km/h.
- Do not introduce a nested speed object or a new speed abstraction unless reuse of the existing speed utility cannot satisfy the implementation cleanly.
- Do not change Strava handling for pace types expressed as time per distance.

## Input Forms And Storage

Average moving speed keeps its existing parameter name and storage fields:

```text
speed
```

```js
speedMin
speedMax
```

Cruising speed uses the new parameter name and storage fields:

```text
cruisingSpeed
```

```js
cruisingSpeedMin
cruisingSpeedMax
```

Both characteristics support the same four input forms and the same formatting rules:

| User input | Stored bounds | Display |
|---|---|---|
| `25-28` | min `25`, max `28` | `25-28 km/h` |
| `25+` or `25-` | min `25`, max absent | `25+ km/h` |
| `-28` | min absent, max `28` | `up to 28 km/h` / `до 28 км/ч` |
| `25` or `~25` | min `25`, max `25` | `~25 km/h` |

The existing `parseSpeedInput()` and `formatSpeed()` utilities remain the single source of truth for this grammar and presentation. They must be reused for both characteristics.

### Validation

Malformed speed values must produce localized validation feedback. They must not be silently ignored, treated as an empty value, or accepted while advancing the wizard.

The current average-speed wizard validator always returns `{ valid: true }`, even when `parseSpeedInput(text)` returns `null`. As a result, input such as `быстро` is currently converted into two null bounds and the wizard advances. The implementation must correct this behavior for the existing average-moving-speed step and must not copy it into the new cruising-speed step.

Validation applies equally to `speed` and `cruisingSpeed`, including:

- non-numeric input is rejected
- a range whose minimum is greater than its maximum is rejected
- the entire trimmed input must match one supported form; a numeric prefix followed by unrelated characters is rejected
- values rejected by the existing speed grammar remain rejected
- valid decimal behavior remains consistent with the existing speed utility

The strict grammar and bound-order check belong in `parseSpeedInput()`, not separately in wizard configuration. `parseSpeedInput()` must return `null` for malformed input, including a reversed range such as `30-25`.

Each wizard speed validator must use this contract:

```js
const parsed = parseSpeedInput(text);
if (parsed === null) {
  return { valid: false, error: localizedInvalidSpeedError };
}

return {
  valid: true,
  value: mapParsedBoundsToWizardKeys(parsed)
};
```

For invalid input, the wizard must remain on the same step, show the localized error, and leave the previously stored bounds and preview unchanged. Skip and clear are handled by the wizard before field validation and therefore are not parsing errors.

Parameterized and AI save paths must observe the same strict parser result and return their established localized error behavior instead of silently omitting an invalid speed. All callers must continue using the shared utility rather than duplicating parsing rules.

### Update Clearing

In parameter and AI update modes:

```text
speed: -
```

clears only `speedMin` and `speedMax`, while:

```text
cruisingSpeed: -
```

clears only `cruisingSpeedMin` and `cruisingSpeedMax`.

Changing between average, range, minimum-only, and maximum-only forms must explicitly clear the unused bound so a stale value cannot survive an update.

Clearing or replacing one speed characteristic must not modify the other.

## Data Model And Persistence

Extend the ride contract with two optional numeric fields:

```js
{
  speedMin: Number,
  speedMax: Number,
  cruisingSpeedMin: Number,
  cruisingSpeedMax: Number
}
```

Requirements:

- add `cruisingSpeedMin` and `cruisingSpeedMax` to the storage interface ride typedef
- add both optional numbers to the Mongo ride schema
- include both in Mongo mapping from persisted documents to the application ride shape
- ensure memory storage preserves both fields through create, read, and update operations
- preserve missing values as missing, `undefined`, or `null` according to the existing storage-path convention
- do not assign a synthetic cruising-speed default

No data migration or schema-version migration is required. Existing ride documents have no cruising-speed fields and therefore continue to represent rides with only average moving speed. Existing `speedMin` and `speedMax` values retain their current meaning.

## Ride Message And Preview Rendering

Render the two characteristics independently. If both are present, average moving speed appears first:

```text
⚡ Average moving speed: ~24 km/h
🛣️ Cruising speed: 27-30 km/h
```

```text
⚡ Средняя скорость движения: ~24 км/ч
🛣️ Крейсерская скорость: 27-30 км/ч
```

Rules:

- retain `⚡` for average moving speed
- use `🛣️` for cruising speed
- omit each line independently when its corresponding bounds are absent
- render both final ride announcements and live previews with identical labels, order, units, and value formatting
- continue HTML-escaping user-originated content; numeric speed formatting introduces no new HTML
- do not combine both characteristics into one line

The expanded average-moving-speed label replaces the current abbreviated `Avg speed` / `Ср. скорость` label everywhere, including existing rides that have no cruising speed.

## Parameterized Command Mode

Add `cruisingSpeed` to the canonical named parameters accepted by ride commands.

Example creation:

```text
/newride
title: Saturday gravel ride
when: saturday 09:00
speed: 24-25
cruisingSpeed: 28-30
```

The parameter must work in all established parameterized flows:

- `/newride`
- `/updateride`
- `/dupride`

Parameter matching remains case-insensitive through the existing canonical-key normalization. Help output must list and explain both `speed` and `cruisingSpeed`.

`/dupride` copies both speed characteristics unless the corresponding override is supplied. Duplicate reconstruction must preserve each stored form:

- equal bounds become a plain number
- two different bounds become `min-max`
- minimum-only becomes `min+`
- maximum-only becomes `-max`
- absent bounds omit the parameter

An override for one characteristic must not prevent the other from being copied.

## Wizard Behavior

Add a separate optional cruising-speed step immediately after the existing average-moving-speed step:

```text
duration → average moving speed → cruising speed → meeting point
```

Backward navigation follows the reverse order. Update and duplicate wizards prefill both cruising-speed bounds from the source ride.

The average-moving-speed prompt must:

- use the expanded label
- state that stops are excluded
- explain that the value is the average over the full route
- continue showing all supported input forms

The cruising-speed prompt must:

- explain that it is normally held on flat, fast sections
- show the same four supported input forms
- be optional and clearable

The wizard must:

- validate both fields through the shared speed parser
- return `{ valid: false, error }` when the shared parser returns `null`
- remain on the current step without mutating bounds or preview after invalid input
- keep the two pairs of bounds independent in state
- include both pairs in live-preview data
- include both pairs in final create/update data
- clear only the active field when the user enters `-` or chooses Skip
- show an existing value using the same formatter used by ride messages

## AI Ride Mode

Extend AI extraction with the optional `cruisingSpeed` field. The AI service returns speed values in the same textual forms accepted by parameter mode.

### Classification Rules

The prompt must teach the model the semantic distinction:

- explicit average wording maps to `speed`
- otherwise, an unqualified riding-speed statement maps to `cruisingSpeed`
- both fields are returned when the user supplies both concepts
- neither field is inferred from the other

Explicit average wording includes concepts such as:

- `average speed`, `average moving speed`, `avg speed`
- `средняя скорость`, `средняя скорость движения`

Cruising-speed wording includes concepts such as:

- `cruising speed`, `pace`, `riding speed`
- `крейсерская скорость`, `скорость`, `скорость движения`, `темп группы`
- phrases equivalent to `we ride`, `we hold`, `едем`, or `держим`

Examples:

| User wording | Expected extraction |
|---|---|
| `средняя 24` | `{ "speed": "24" }` |
| `едем 27-30` | `{ "cruisingSpeed": "27-30" }` |
| `скорость 28` | `{ "cruisingSpeed": "28" }` |
| `pace 28-30` | `{ "cruisingSpeed": "28-30" }` |
| `средняя 24, держим 28-30` | `{ "speed": "24", "cruisingSpeed": "28-30" }` |
| `average moving speed 24, cruising speed 28+` | `{ "speed": "24", "cruisingSpeed": "28+" }` |

In multi-turn dialogs, later explicit statements continue overriding earlier values only for the corresponding field. Updating average moving speed must not erase cruising speed and vice versa.

### AI Preview And Save

AI live preview must:

- parse both fields with the shared speed utility
- merge each field independently with the existing ride during update mode
- honor independent clear operations
- render both through the standard ride preview formatter

Final save continues through `RideService.createRideFromParams()` or `updateRideFromParams()` so AI mode does not implement a separate storage path.

## Strava Import

Strava speed-based pace groups represent cruising speed, not average moving speed.

For `pace_type === 'speed'`:

- preserve the existing extraction of the overall minimum and maximum across pace groups
- write the extracted result to `cruisingSpeedMin` and `cruisingSpeedMax`
- do not populate `speedMin` or `speedMax` from pace groups
- allow equal extracted bounds; the shared convention renders them as an approximate single value
- continue including the human-readable pace-groups breakdown in additional information

For pace types expressed as time per distance:

- do not populate either speed-field pair
- preserve the existing additional-information formatting behavior

This behavior applies to newly imported rides only. Historical Strava-imported rides are not rewritten.

Strava import help text in both locales must say that the cruising-speed value is populated from speed-based pace groups. References that currently describe this as average speed or a generic speed range must be updated.

## Service And Layer Responsibilities

### `FieldProcessor`

- own conversion of both named speed parameters into persistence fields
- reuse the central speed parser
- implement independent update clearing and stale-bound removal
- return a localized validation error for malformed speed input

### `RideService`

- continue coordinating parameterized create, update, and duplicate use cases
- preserve both characteristics during duplication
- keep speed parsing delegated to `FieldProcessor` and the shared utility

### Command Handlers

- populate wizard prefill data for update and duplicate flows
- keep reusable speed parsing and validation out of Telegram-facing handlers

### Wizard

- own step ordering, state navigation, field clearing, and preview-state construction
- delegate parsing and formatting to the existing speed utility

### AI Service And Handler

- the AI service owns extraction semantics and terminology guidance
- the AI command handler maps extracted values into preview data and delegates final persistence through `RideService`

### Formatter

- own the user-visible labels, icons, ordering, omission, and value rendering for both final messages and previews
- reuse `formatSpeed()` for each characteristic

### Strava Parser And Command Flow

- the Strava parser owns conversion of speed-type pace groups into cruising-speed bounds
- the command flow passes the resulting ride data through the established creation path without reinterpreting it as average speed

## Localization And Documentation

Update English and Russian locale keys for:

- expanded average-moving-speed formatter label
- cruising-speed formatter label
- average-moving-speed wizard prompt and explanation
- cruising-speed wizard prompt and explanation
- cruising-speed parameter help
- malformed average-moving-speed validation feedback
- malformed cruising-speed validation feedback
- AI dialog prompt/help text that currently lists only average speed
- Strava import help text that describes extracted pace groups

Update living user documentation, including parameter lists and command examples in `README.md`, if those sections expose the affected behavior.

Historical documents in `docs/changes/`, including the existing speed, AI ride, wizard preview, and Strava specifications, remain immutable and must not be edited. The current implementation plus this specification define the new target behavior.

## Expected Implementation Surface

Production files expected to require changes:

- `src/storage/interface.js`
- `src/storage/mongodb.js`
- `src/utils/speed-utils.js`
- `src/utils/FieldProcessor.js`
- `src/utils/RideParamsHelper.js`
- `src/services/RideService.js`
- `src/services/AiRideService.js`
- `src/commands/AiRideCommandHandler.js`
- `src/commands/UpdateRideCommandHandler.js`
- `src/commands/DuplicateRideCommandHandler.js`
- `src/wizard/wizardFieldConfig.js`
- `src/wizard/RideWizard.js`
- `src/formatters/MessageFormatter.js`
- `src/utils/strava-event-parser.js`
- `src/i18n/locales/en.js`
- `src/i18n/locales/ru.js`
- `README.md`

This list is an implementation guide rather than permission for unrelated refactoring. Implementers must inspect current call sites before editing and keep the change narrowly scoped.

## Testing Strategy

Follow the existing test layers and prefer one realistic scenario test for the main user journey plus focused unit and component coverage.

### Shared Speed Utility And Field Processing

- all four forms continue parsing for average moving speed
- all four forms parse identically for cruising speed
- malformed input is rejected rather than silently ignored
- update clearing nulls both bounds of only the selected characteristic
- switching forms removes stale bounds
- changing one characteristic preserves the other

### Parameter Helper And Ride Service

- `cruisingSpeed` is accepted case-insensitively and included in localized valid-parameter help
- create persists only average, only cruising, both, or neither
- update modifies and clears each independently
- duplicate copies both by default
- duplicate overrides each independently
- duplicate preserves average, range, minimum-only, and maximum-only forms

### Storage

- memory storage round-trips both cruising-speed fields
- Mongo storage round-trips both cruising-speed fields
- Mongo mapping of legacy documents leaves cruising-speed fields absent
- existing speed fields remain unchanged

### Wizard

- new step order and backward navigation are correct
- create, update, and duplicate flows store the new values
- update and duplicate prefill show the source values
- Skip and `-` clear only cruising speed at its step
- invalid input keeps the user on the same step with localized feedback
- live preview shows only average, only cruising, and both in the correct order

### Formatter

- English and Russian use the approved full labels
- average moving speed retains `⚡`
- cruising speed uses `🛣️`
- average appears first when both exist
- every supported value form renders correctly for both characteristics
- each absent line is omitted independently
- final announcements and previews have matching behavior

### AI

- explicit average wording extracts `speed`
- unqualified speed, `pace`, and hold/ride wording extracts `cruisingSpeed`
- a single number is valid for either field
- both concepts can be extracted together
- multi-turn overrides remain field-specific
- update preview falls back independently to both stored values
- clearing one AI field preserves the other
- confirm passes both parameters through the normal ride-service path

### Strava

- speed-type pace groups populate cruising-speed bounds only
- multiple groups produce the overall minimum and maximum
- a single zero-range group produces equal cruising-speed bounds
- time-per-distance pace groups populate neither speed pair
- existing pace-group additional information remains present
- imported average-moving-speed fields remain unset unless supplied by another explicit source

### Scenario Coverage

Add or extend at least one scenario integration test proving a user-visible ride-creation or update flow with both characteristics, persisted state, and rendered output.

Locale consistency tests must cover all new keys.

## Verification Commands

Run the standard basic suite only:

```sh
./run-tests.sh --mode basic
```

Do not run Mongo mode unless explicitly requested. Commands must be executed through the repository's devcontainer-aware entry points as required by `AGENTS.md`.

## Compatibility And Rollout

- Existing rides render their stored speed as `Average moving speed` / `Средняя скорость движения` and omit cruising speed.
- Existing parameterized commands remain valid; `speed` retains its current syntax and storage meaning.
- Existing AI data containing `speed` remains valid and now receives the more explicit average-moving-speed label.
- Existing Strava-imported rides remain unchanged; only new imports map pace groups to cruising speed.
- No database migration, backfill, dependency change, feature flag, or staged rollout is required.
- A rolling deployment is tolerant of documents missing the new optional fields.

## Success Criteria

- A ride can store and display only average moving speed, only cruising speed, both, or neither.
- Both characteristics support the same four input forms and formatting rules.
- User-facing labels and explanations communicate the approved semantic distinction in English and Russian.
- Average moving speed appears first with `⚡`; cruising speed appears second with `🛣️`.
- Parameter, wizard, AI, update, and duplicate flows preserve the two characteristics independently.
- Strava speed-based pace groups populate cruising speed and do not populate average moving speed.
- Malformed speed input produces validation feedback instead of being silently accepted or ignored.
- Existing rides and commands remain backward compatible without a data migration.
- Relevant focused, scenario, storage, formatter, AI, localization, and Strava tests pass.
- `./run-tests.sh --mode basic` passes.

## Implementation Plan

1. Extend the ride contract and persistence mapping with optional cruising-speed bounds.
2. Generalize field processing and validation so both named parameters use the shared speed grammar.
3. Add parameter help and ride-service duplicate preservation.
4. Add the wizard step, state mapping, prefill, navigation, and live-preview data.
5. Add formatter labels, icons, ordering, and independent omission.
6. Extend AI extraction, preview merging, clearing, and classification tests.
7. Remap Strava speed-type pace groups to cruising-speed fields.
8. Update localized help and living documentation.
9. Add focused and scenario coverage, then run the complete basic suite.

Implementation must proceed incrementally and keep the basic suite passing between slices where practical.

## Open Questions

None. Product terminology, input grammar, storage shape, rendering order, icon, AI classification, Strava mapping, compatibility, and migration behavior are approved above.
