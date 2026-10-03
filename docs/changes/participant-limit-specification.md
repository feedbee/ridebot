# Specification: Ride Participant Limit

## Objective

Add an optional participant limit to every ride. A ride creator can define a default for future rides and override it for an existing ride. Once the number of users in the `joined` participation state reaches the limit, another user cannot switch to `joined` until a place becomes available.

The feature applies uniformly to all currently supported rides. Moderated participation is outside the current product model and is not part of this change.

Success means that the limit is persisted as a ride setting, is visible next to the joined-participant list, and cannot be exceeded even when multiple users try to take the last available place concurrently.

## Product Model

Add the integer setting:

```js
participantLimit: 0
```

It belongs to the existing settings hierarchy:

```js
user.settings.rideDefaults.participantLimit
ride.settings.participantLimit
```

Its meaning is:

- `0`: participation is unlimited;
- `1` through `1000`: maximum number of records allowed in `ride.participation.joined`.

Only `joined` records count toward the limit. `thinking` and `skipped` records do not count. The ride creator counts when the creator has a `joined` record; the setting does not reserve a separate organizer place.

Existing rides and users without the field resolve it to the system default `0`. A migration is not required solely to backfill missing values if the normal settings-resolution path provides this compatibility.

## Defaults And Snapshot Semantics

The setting follows the existing ride-settings rules:

1. The system default is `0`.
2. User-level `/settings` changes the default copied into future rides only.
3. A new ride stores an explicit settings snapshot resolved from explicit input, the creator's defaults, and system defaults.
4. Ride-level `/settings` changes only the selected existing ride and remains creator-only.
5. Later changes to user defaults do not affect existing rides.
6. Existing duplicate-own and duplicate-other settings semantics remain unchanged; `participantLimit` travels through the same snapshot logic as the other ride settings.

## Accepted Input

All product entry points use the same validation rule. Accepted textual forms are exactly:

```text
0
1
2
...
999
1000
```

The canonical textual grammar is:

```regex
^(?:0|[1-9]\d{0,2}|1000)$
```

This rejects:

- negative values;
- values greater than `1000`;
- fractions and decimal notation such as `1.0` or `2.5`;
- signs such as `+5`;
- exponent, hexadecimal, binary, or other non-plain-decimal notation;
- leading zeros such as `005`;
- empty input or non-numeric text.

Outer whitespace introduced by message parsing may be trimmed before validation. Whitespace inside the value is invalid. Structured numeric input is accepted only when it is an integer from `0` through `1000` inclusive.

## Settings User Experience

### User Defaults

The user-default settings screen displays a `Participant limit` / `Лимит участников` row. Unlimited participation is displayed as `Unlimited` / `Без ограничений`, rather than as a bare zero.

An inline button opens numeric input. The bot asks the user to send the new value and explains that `0` means unlimited and that the largest accepted value is `1000`.

After valid input:

- the user default is updated;
- the settings screen is rendered with the new value;
- the value affects only rides created afterward.

After invalid input:

- no setting is changed;
- the bot shows a localized validation error;
- the user remains able to retry or cancel the input flow.

### Existing Ride

The creator-only ride settings screen provides the same row, button, prompt, validation, retry, and cancellation behavior. After a valid change:

- the selected ride's settings snapshot is updated;
- all tracked announcements for that ride are refreshed immediately so their displayed limit is current;
- no existing participant is removed.

The input flow must retain enough scope to distinguish a user-default update from a ride-specific update and must not allow a stale or forged interaction to bypass ride ownership checks.

## Text And Structured Ride Inputs

Creation and update flows that accept power-user `settings.*` parameters also accept:

```text
settings.participantLimit: 5
```

The same `0` through `1000` validation applies. Invalid input rejects the create or update operation with a localized validation message and does not persist a partial change.

Structured and AI-assisted ride creation or update may provide:

```js
settings: {
  participantLimit: 5
}
```

The setting remains optional. Omitting it uses the normal default or update snapshot behavior.

## Ride Announcement Presentation

When the effective limit is greater than zero, render this line immediately above and in the same visual block as the joined-participant line:

```text
Лимит участников: 5
🚴 Участвуют (3): ...
```

```text
Participant limit: 5
🚴 Joined (3): ...
```

When the limit is `0`, omit the limit line entirely. The line appears consistently in every localized ride announcement produced by the shared formatter, including refreshed copies in different chats or topics.

The separate `/listparticipants` response is not changed by this requirement; the requested placement concerns the participation block in the ride announcement.

## Participation Rules

The reusable participation service owns the limit decision. Telegram callback handlers only map service outcomes to localized user feedback.

For a requested transition to `joined`:

1. If the user is already `joined`, preserve the existing no-op behavior, even when the ride is currently at or above its limit.
2. If `participantLimit` is `0`, allow the transition.
3. If the current `joined` count is below the positive limit, allow the transition.
4. If the current `joined` count is equal to or greater than the positive limit, reject the transition without changing any participation state.

For transitions to `thinking` or `skipped`, the limit does not apply. A joined user may leave `joined` normally, making a place available. If that user then tries to return while the ride is full, the request is treated like any other new transition to `joined` and is rejected.

Changing a positive limit to a value below the current joined count never removes participants. While `joined.length >= participantLimit`, no user outside `joined` may enter `joined`. Increasing the limit, or reducing the joined count below it, makes joining available again.

On a full ride, the join callback returns a short localized callback notification:

- Russian: `Извините, лимит участников исчерпан.`
- English: `Sorry, the participant limit has been reached.`

A rejected join does not update ride announcements, schedule participation notifications, or add the user to an attached Telegram group.

## Concurrency And Storage Correctness

Checking the count in application memory before an unconditional storage write is insufficient. The storage mutation that moves a user into `joined` must atomically verify that capacity is still available.

When two or more users concurrently request the last place:

- at most one request succeeds;
- the persisted `joined` count does not exceed the positive limit;
- every losing request receives the full-limit outcome;
- no losing user's previous `thinking` or `skipped` state is removed.

Both MongoDB storage and in-memory storage must implement the same observable contract. The storage/service result must distinguish at least: changed, already in requested state, and participant limit reached. Existing not-found and cancelled-ride outcomes remain intact.

## Architecture And Project Structure

Expected responsibility boundaries:

- `src/services/SettingsService.js`: system default, snapshots, and setting merges;
- `src/services/RideParticipationService.js`: reusable participation-limit rule and side-effect gating;
- `src/storage/`: atomic capacity-aware participation mutation for each storage implementation;
- `src/commands/RideSettingsCommandHandler.js`: settings input UX, scope and ownership handling;
- `src/commands/ParticipationHandlers.js`: localized mapping of the full-limit service outcome;
- `src/formatters/MessageFormatter.js`: conditional limit line in the participation block;
- `src/utils/FieldProcessor.js` and ride parameter helpers: strict text and structured input support;
- `src/i18n/locales/`: English and Russian labels, prompts, validation errors, and callback feedback;
- `src/__tests__/`: focused unit/service/storage tests and an end-to-end in-process scenario.

Do not put the reusable capacity rule in a Telegram command handler or formatter.

## Code Style

Use the existing application-level contracts and structured outcomes. A representative shape is:

```js
const result = await rideParticipationService.changeParticipation({
  rideId,
  participantProfile,
  targetState: 'joined',
  language: ctx.lang,
  api: ctx.api
});

if (result.status === 'participant_limit_reached') {
  await ctx.answerCallbackQuery(
    this.translate(ctx, 'commands.participation.participantLimitReached')
  );
}
```

Follow existing naming, localization, Docblock, and settings-snapshot conventions. Do not introduce Telegram objects into service or storage contracts.

## Testing Strategy

Run the default test suite with:

```sh
./run-tests.sh --mode basic
```

Do not run Mongo mode by default. Add focused Mongo storage coverage that can run in the explicit Mongo test mode, but execute it only when requested or when the environment is known to support it safely.

Required coverage:

- settings default and snapshot resolution, including legacy missing fields;
- strict acceptance of `0`, positive integers, and `1000`;
- rejection of negative, fractional, signed, leading-zero, non-decimal, non-numeric, and greater-than-`1000` inputs;
- user-default and ride-specific settings input, retry, cancellation, ownership, and persistence;
- create/update support for `settings.participantLimit`;
- announcement formatting with a positive limit and omission with `0` in Russian and English;
- joining below capacity and rejection at capacity;
- `thinking` and `skipped` remaining unrestricted;
- an already-joined user receiving the existing no-op result at or above capacity;
- lowering and increasing the limit without removing existing participants;
- rejected joins producing no notification, group-membership, or announcement side effects;
- concurrent attempts for the last place never exceeding the limit;
- equivalent MemoryStorage and MongoDBStorage behavior;
- at least one scenario test through real bot wiring covering settings change, synchronized announcement rendering, filling the ride, and rejecting the next join.

## Boundaries

Always:

- enforce the rule at a concurrency-safe storage boundary;
- use the shared settings resolution path;
- preserve a rejected user's prior participation state;
- localize all user-visible Russian and English text;
- refresh tracked ride announcements after a ride-specific limit change;
- run `./run-tests.sh --mode basic` before completing implementation.

Ask first:

- changing the agreed `0` through `1000` range or textual grammar;
- adding a dependency or a new persistence technology;
- changing how ride duplication inherits settings;
- adding moderated participation semantics.

Never:

- remove existing participants when a limit is lowered;
- count `thinking` or `skipped` toward the limit;
- reserve an implicit extra place for the organizer;
- perform join side effects for a rejected request;
- run Mongo test mode unless explicitly requested.

## Success Criteria

The feature is accepted when all of the following are true:

1. Every ride resolves an integer participant limit, defaulting to unlimited (`0`).
2. Creators can configure the default for future rides and an individual existing ride through `/settings`.
3. Text and structured ride inputs accept the same setting with strict validation.
4. Positive limits appear immediately above the joined list; unlimited rides show no limit line.
5. A transition to `joined` cannot increase the joined count beyond a positive limit, including under concurrent requests.
6. Full-limit rejection uses the approved short Russian or English callback message and causes no mutation or side effects.
7. Lowering a limit never removes existing participants, and increasing it restores capacity as soon as the new limit permits.
8. Existing ride behavior remains unchanged when the limit is `0`.
9. The basic test suite passes.

## Open Questions

None.
