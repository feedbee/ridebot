# Private Calendar Export Specification

## Status

Implemented on 2026-08-29. Updated the same day to use a one-hour calendar
event when a ride has no estimated duration, to render the announcement action
as a compact private deep link, and to make the private provider menu compact
and closable.

## Objective

Let a Telegram user add a ride to their personal calendar without publishing a
calendar file or a user-specific response in the group that contains the ride
announcement.

The ride announcement exposes one `Add to calendar` HTML link. It opens the
bot's private chat through `/start calendar_<rideId>`, where the bot delivers a
private calendar menu.
The menu offers direct Google Calendar and Outlook links plus a separate action
that sends an iCalendar (`.ics`) document to the same private chat.

The feature does not connect to, read from, or write to a user's calendar
account through OAuth. Google and Outlook still require the user to confirm the
prefilled event. Importing the `.ics` file is a one-time copy and does not keep
the event synchronized with later ride changes.

## User Flows

### Existing Private Conversation

1. A user follows `Add to calendar` in a ride announcement.
2. Telegram opens the bot's private chat with `start=calendar_<rideId>`.
3. The bot validates the start payload and loads the current ride.
4. The bot replies with the private calendar menu.
5. Google Calendar and Outlook buttons open provider-specific, prefilled event
   creation pages.
6. Pressing `Apple / download .ics` in the private menu makes the bot generate
   the current event in memory and send it to that private chat with
   `api.sendDocument`.

No calendar menu or document is posted to the announcement chat.

### User Has Not Started Or Has Blocked The Bot

1. The private `sendMessage` attempt fails with Telegram error code `403`.
2. The callback answer redirects the user to
   `https://t.me/<bot_username>?start=calendar_<rideId>`.
3. Telegram requires the user to press `Start`, including when restarting a
   previously blocked conversation.
4. The bot validates the `/start` payload, loads the current ride, and sends the
   calendar menu in the resulting private chat.

Errors other than `403` follow the existing generic callback error path and do
not expose internal Telegram error details.

### Invalid Or Unavailable Ride

- An unknown or malformed ride ID produces a localized error and no links or
  document.
- A cancelled ride produces a localized unavailable message and no links or
  document.
- A ride with no duration (`null` or `undefined`) is exported as a one-hour
  event. An explicit zero, negative, fractional, or otherwise invalid duration
  remains an error.
- A past ride is treated as unavailable and cannot be exported.

## Calendar Event Contract

The application service builds one provider-neutral event from a ride:

```js
{
  uid: `ride-${ride.id}@ridebot`,
  title: ride.title,
  start: ride.date,
  end: new Date(ride.date.getTime() + (ride.duration ?? 60) * 60_000),
  location: ride.meetingPoint || '',
  description: 'Localized ride details and route links'
}
```

The start and end are instants. Provider links use UTC timestamps. The `.ics`
document also uses UTC `DTSTART` and `DTEND`, avoiding dependence on a calendar
client's interpretation of `DEFAULT_TIMEZONE`. `DEFAULT_TIMEZONE` remains the
timezone used when ride input is parsed and displayed.

The description may include the ride identifier, organizer, category,
distance, pace, additional information, and route URLs when present. Values are
plain text and must be escaped independently for URL query parameters and for
iCalendar text properties.

### Google Calendar

Use a prefilled Google Calendar template URL containing the title, UTC start and
end, description, and meeting point. Opening the URL must not authorize the bot
or create an event until the user confirms it in Google Calendar.

### Outlook Calendar

Use Outlook's prefilled event creation URL containing the same neutral event
fields. Opening the URL must not authorize the bot or create an event until the
user confirms it in Outlook.

### iCalendar Document

Generate an RFC 5545-compatible UTF-8 document with CRLF line endings and at
least:

- `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID`, and `CALSCALE:GREGORIAN`;
- one `VEVENT` containing `UID`, `DTSTAMP`, `DTSTART`, `DTEND`, and `SUMMARY`;
- optional `LOCATION` and `DESCRIPTION` when non-empty;
- escaped backslashes, commas, semicolons, and line breaks;
- folded content lines whose UTF-8 representation exceeds 75 octets;
- filename `ride-<rideId>.ics` and MIME type `text/calendar; charset=utf-8`.

The document is generated in memory. It is not written to disk or made
available through a public HTTP route.

## Telegram Interface

### Announcement Link

- Add one compact HTML link using the current bot username and start payload
  `calendar_<rideId>`.
- Show it in creator and non-creator announcements when the ride is active.
- Do not show it for cancelled rides.
- Remove the calendar action from the announcement keyboard while preserving
  the `calendar:menu:<rideId>` callback handler for already-published messages.

### Private Calendar Menu

The private message contains three actions in its first row:

- a URL button for Google Calendar;
- a URL button for Outlook Calendar;
- a callback button `calendar:ics:<rideId>`.

The second row contains `Close` with callback data `calendar:close`. It deletes
only the private calendar-menu message. A close callback outside a private chat
must not delete a group message.

The `.ics` callback is accepted only from a private chat. A forged callback
originating in a group must not send a document to that group; the handler sends
the document to `ctx.from.id` instead and answers the callback privately.

Callback data and `/start` payloads accept only the ride ID format already used
by the application (`\w+`). Telegram's 64-byte callback and start-parameter
limits must be respected.

## Architecture And Project Structure

- `docs/changes/private-calendar-export-specification.md`: immutable historical
  design after the change lands.
- `src/services/CalendarEventService.js`: validates exportability, builds the
  neutral event, provider URLs, and `.ics` content. It contains no Telegram
  context objects.
- `src/commands/CalendarCommandHandler.js`: owns callback entry points, private
  Telegram delivery, `403` deep-link fallback, and localized replies.
- `src/commands/StartCommandHandler.js`: recognizes the validated calendar deep
  link and delegates the use case; the normal `/start` response remains
  unchanged for all other payloads.
- `src/formatters/MessageFormatter.js`: renders the announcement deep link but
  does not build calendar event data.
- `src/core/Bot.js`: constructs collaborators and registers calendar callback
  patterns.
- `src/i18n/locales/{en,ru}.js`: localized button labels and user-visible
  outcomes.
- `src/__tests__/services/`: unit tests for URLs, UTC timestamps, iCalendar
  escaping, UTF-8 folding, and exportability.
- `src/__tests__/commands/` and `src/__tests__/integration/`: focused handler
  branches and at least one realistic scenario through bot wiring.

No database fields, migrations, OAuth credentials, new HTTP routes, or runtime
dependencies are introduced.

## Code Style

Follow the existing JavaScript and service-boundary conventions. Telegram
objects stay at the command boundary:

```js
const outcome = this.calendarEventService.createExport(ride, {
  language: ctx.lang
});

await ctx.api.sendMessage(ctx.from.id, outcome.message, {
  reply_markup: outcome.keyboard
});
```

Classes and methods receive docblocks with typed `@param` annotations. External
input is validated once in the command handler before application-level data is
passed to the service.

## Commands

- Focused tests during TDD:
  `./scripts/devcontainer-exec.sh npm test -- --runInBand <test-file>`
- Standard project verification:
  `./run-tests.sh --mode basic`
- Dependency security report:
  `./scripts/devcontainer-exec.sh npm audit --omit=dev`

No Mongo-mode test run is part of this change.

## Testing Strategy

### Unit And Service Tests

- compute the end instant from a positive duration;
- use 60 minutes when duration is missing;
- reject explicit zero, fractional, or negative duration;
- reject cancelled and past rides;
- preserve Unicode in titles and descriptions;
- URL-encode provider fields;
- produce UTC Google and Outlook date ranges;
- escape and fold `.ics` text correctly by UTF-8 octets;
- generate stable `UID` and safe filenames from validated ride IDs.

### Command Tests

- successful group callback sends the menu only to `ctx.from.id` and answers
  with confirmation;
- `403` private delivery failure returns a deep-link callback URL;
- non-`403` delivery failures use the generic callback failure behavior;
- `.ics` callback sends a document only to `ctx.from.id`;
- malformed, missing, cancelled, past, and explicitly invalid-duration rides do
  not generate provider links or files;
- normal `/start` behavior is unchanged;
- `/start calendar_<rideId>` sends the menu after validation.

### Scenario Test

Create a ride without duration, follow its calendar link into the private bot
chat, and assert that the private outbox receives the compact calendar menu and
the `.ics` document remains private.

## Boundaries

### Always

- Load the ride from storage at the time of each action.
- Address private delivery using the authenticated callback/message sender ID,
  never a user ID supplied in callback or deep-link data.
- Validate ride IDs before storage lookup.
- Generate documents in memory and keep all calendar descriptions plain text.
- Answer every callback query.
- Preserve existing ride announcement, participation, and owner-action flows.

### Ask First

- Add OAuth or request access to a user's calendar account.
- Introduce a public `.ics` endpoint or calendar subscription feed.
- Persist exported event IDs or personal calendar data.
- Add a runtime dependency.
- Change database schemas or deployment configuration.

### Never

- Post the private calendar menu or `.ics` document into a group as fallback.
- Put a Telegram user ID into a public callback or deep-link parameter.
- Log generated calendar content or Telegram API credentials.
- Use any fallback duration other than the documented 60 minutes.
- Claim that imported events remain synchronized with ride updates.

## Implementation Plan And Tasks

- [x] Add service tests and implement the neutral event, provider URLs, and
  `.ics` generation.
  - Acceptance: deterministic event data is correct, safely encoded, and needs
    no runtime dependency.
  - Verify: focused service tests pass.
- [x] Add handler tests and implement private menu/document delivery plus the
  `403` deep-link fallback.
  - Acceptance: all successful delivery targets are `ctx.from.id`; no group
    fallback exists.
  - Verify: focused command tests pass.
- [x] Add formatter and wiring tests, then expose the announcement callback and
  calendar deep-link start flow.
  - Acceptance: eligible announcements expose the button and both callback
    patterns are registered.
  - Verify: formatter, core, and start-handler tests pass.
- [x] Add the scenario journey and localizations.
  - Acceptance: the user-visible private flow works through real bot wiring in
    English and Russian without changing unrelated messages.
  - Verify: scenario suite passes.
- [x] Run full verification and review the diff across correctness,
  readability, architecture, security, and performance.
  - Acceptance: all required findings are resolved and basic tests pass.
  - Verify: `./run-tests.sh --mode basic` and production dependency audit.

## Success Criteria

1. Every active, future ride announcement has one `Add to calendar` action.
2. Pressing it never posts a calendar menu or file to a group.
3. Users with an available private chat receive Google, Outlook, and `.ics`
   options privately.
4. A Telegram `403` redirects the user through a validated private deep link.
5. The `.ics` file is generated only after the private download action and is
   sent only to the requesting user.
6. Event start, end, title, location, and description reflect the latest ride
   state at action time.
7. Missing duration produces a one-hour event; cancellation, past time, invalid
   IDs, invalid explicit durations, and Telegram errors produce localized safe
   failures.
8. No OAuth, persistent calendar state, public download endpoint, schema change,
   or new dependency is required.
9. Focused and scenario tests cover the happy path and security-sensitive error
   branches; the complete basic test suite passes.

## Open Questions

None. The assumptions stated in this specification are ready for implementation
once approved.
