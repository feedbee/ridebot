# Planned Rides Command Specification

## Status

Implemented on 2026-09-01.

## Objective

Add a private-chat `/planned` command that shows the rides the current user is
planning to attend. The list is a participation-oriented counterpart to
`/listrides`: it reuses the same compact ride presentation and pagination, but
shows the user's current participation state instead of announcement-count
metadata.

The command helps a user answer "what rides am I planning to attend?" without
having to find the original announcements. A ride is eligible when the user is
currently either `joined` or `thinking`, including rides created by that user.

## User-Visible Behavior

### Entry Points

`/planned` is available only in private chats, like `/listrides`.

The feature is exposed through all of these private-chat entry points:

- the `/planned` slash command and Telegram's system command menu;
- the localized `/help` content;
- a new `Planned rides` / `Запланированные райды` button in the expanded main
  menu.

The expanded main-menu layout becomes:

```text
[Create with wizard] [Create with AI] [Created rides]
[Planned rides]      [Settings]       [Help]
[Close]
```

The planned-rides button is the first button on the second row, immediately
before Settings. Its callback uses `main:planned` and opens page 1 through the
same handler as `/planned`.

The persistent reply keyboard installed by `/start` does not change.

### Eligibility Window

The result contains rides that satisfy both conditions:

1. the current user's participation state is `joined` or `thinking`;
2. the ride starts on the current calendar day or later.

"Current calendar day" is evaluated in `config.dateFormat.defaultTimezone`.
When no timezone is configured, the server's local timezone is used, matching
the existing date-handling fallback. The lower bound is the start of that day,
not the current instant. Therefore a ride that started earlier today remains in
the list, even if it has already finished.

Rides from earlier calendar days are excluded. Rides whose current state is
`skipped`, or which have no participation record for the user, are excluded.
Changing from `joined` or `thinking` to `skipped` removes a ride from subsequent
list reads.

Cancelled rides remain eligible and display the same localized cancelled marker
as `/listrides`.

Ride creators are not treated specially. Because a creator is normally added as
`joined` during ride creation, the creator's own eligible rides appear in
`/planned` alongside rides created by other users.

### Ordering And Pagination

Eligible rides are sorted by `date` ascending, so the nearest ride is first.
Results are paginated with 5 rides per page.

The pagination interface matches `/listrides`:

- Previous is shown when a preceding page exists;
- Next is shown when a following page exists;
- Close is always shown and deletes the list message;
- page numbering and the localized page footer are shown when there is more
  than one page.

Planned-list callbacks use their own namespace, for example
`planned:list:<page>` and `planned:list:close`, so they cannot collide with
`/listrides` callbacks. Opening a page performs a fresh storage read.

Every rendered `/planned` message is otherwise a static snapshot, matching the
existing `/listrides` lifecycle. Changes to a ride or to any user's
participation do not proactively find or edit previously sent list messages.
This applies even when a ride changes between `joined`, `thinking`, and
`skipped`, is cancelled or resumed, or its displayed details are edited. Unlike
tracked ride announcements, list messages are not registered for synchronized
updates.

A newly invoked `/planned` command reflects the current stored state: rides may
appear or disappear, their `joined`/`thinking` status may change, and updated
ride details are rendered. Pressing Previous or Next also refreshes the edited
list message from current storage state. Other previously sent list messages
remain unchanged.

If a participation change makes the requested page empty or moves it beyond the
new last page, the handler normalizes the request to the last valid page and
renders that page. This prevents stale pagination buttons from producing an
empty page while eligible rides still exist.

### List Presentation

The list uses the same Rich Message structure as `/listrides`:

- a localized planned-rides heading;
- an ordered list with numbering across pages;
- ride title;
- localized cancelled marker when applicable;
- date and time rendered with `<tg-time>`;
- meeting point when present;
- ride tags and ID as `🎫 #Ride #<id>`;
- localized page footer when required.

The announcement line from `/listrides` is replaced by the user's current
status:

```text
🙋 Joined
🤔 Thinking
```

Russian labels are `🙋 Участвую` and `🤔 Думаю`. The implementation may adjust
the joined icon or exact wording during localization review, but English and
Russian must use the same semantic states and consistent list structure.

The status shown for each ride must be derived from the same participation data
that made the ride eligible. It must not be inferred from ownership.

When there are no eligible rides, the command returns a localized message with
the meaning:

```text
You have no planned rides.
У вас нет запланированных райдов.
```

The empty response still includes the Close button, matching the existing list
interface.

## Architecture And Project Structure

The change follows the existing command, service, formatter, and storage
boundaries:

- `src/commands/` owns the `/planned` Telegram entry points, pagination callback
  parsing, keyboard construction, replies, edits, and close behavior;
- `src/services/RideService.js` exposes an application-level planned-rides read
  method and delegates persistence to storage;
- `src/storage/interface.js`, `src/storage/memory.js`, and
  `src/storage/mongodb.js` implement the filtered, sorted, paginated query;
- `src/formatters/MessageFormatter.js` owns the planned-list Rich Message
  rendering and localized status presentation;
- `src/telegram/MainMenuKeyboard.js` owns the new expanded-panel button;
- `src/core/Bot.js` wires the command and callback entry points;
- `src/i18n/locales/en.js` and `src/i18n/locales/ru.js` own all visible text,
  help text, button labels, empty state, status labels, title, and command-menu
  descriptions;
- tests remain colocated under `src/__tests__/` according to their existing
  layer.

The service and storage contract uses application values only. No raw Grammy
context is passed outside the command layer. A representative contract is:

```js
const { rides, total } = await rideService.getPlannedRides(
  userId,
  startOfToday,
  skip,
  limit
);
```

Each returned ride must contain enough participation data for the formatter to
render the requesting user's current `joined` or `thinking` state without an
additional query per ride. The implementation must avoid N+1 storage reads.

The start-of-day boundary is computed once per list request at the application
boundary using the configured timezone and is passed to storage as an absolute
`Date`. Memory and Mongo storage therefore receive the same explicit lower
bound and implement identical filtering semantics.

## Persistence And Indexing

MongoDB filters by the user's presence in either
`participation.joined.userId` or `participation.thinking.userId`, applies the
inclusive `date >= startOfToday` boundary, and sorts by `date` ascending before
skip/limit pagination. Counting uses the same eligibility predicate.

The ride collection gains indexes supporting both participation branches and
date ordering:

```js
{ 'participation.joined.userId': 1, date: 1 }
{ 'participation.thinking.userId': 1, date: 1 }
```

Separate indexes are required because the query uses two different array paths.
The implementation must confirm the final query shape with MongoDB-compatible
tests and must not create a compound index containing both participation arrays.

No stored document shape, migration, dependency, or external API is added.

## Code Style

Implementation follows the current ES module and async method conventions,
uses docblocks for new classes and methods, and keeps command handlers free of
reusable business or persistence rules. Representative style:

```js
/**
 * Get current and future rides where a user is joined or thinking.
 * @param {number} userId - Telegram user ID.
 * @param {Date} startOfToday - Inclusive date boundary.
 * @param {number} skip - Number of matching rides to skip.
 * @param {number} limit - Maximum number of rides to return.
 * @returns {Promise<RidesList>}
 */
async getPlannedRides(userId, startOfToday, skip, limit) {
  return this.storage.getPlannedRides(userId, startOfToday, skip, limit);
}
```

Existing list formatting should be reused or factored only as far as needed to
keep `/listrides` and `/planned` structurally consistent. The change must not
alter `/listrides` behavior or its ordering.

## Testing Strategy

### Unit And Formatter Tests

Cover:

- planned-list heading and empty state in English and Russian;
- `joined` and `thinking` status rendering;
- absence of all announcement-count text;
- date, meeting point, ID, cancellation marker, numbering, and page footer;
- HTML escaping for ride-controlled values;
- start-of-day calculation with a configured timezone, without a configured
  timezone, and across a daylight-saving transition.

### Command Tests

Cover:

- `/planned` loads page 1 with limit 5 and the current user ID;
- Previous, Next, and Close button layout;
- distinct planned callback data;
- callback acknowledgement, message editing, and close deletion;
- an out-of-range stale page is normalized to the last valid page;
- the expanded-menu callback opens page 1.

### Service And Storage Tests

Both memory and Mongo storage contract tests cover:

- inclusion of `joined` and `thinking` rides;
- exclusion of `skipped` and unrelated rides;
- inclusion of the user's own rides when their state is eligible;
- inclusion of cancelled rides;
- inclusion of rides earlier on the current day;
- exclusion of rides before the current calendar day;
- ascending date order;
- correct total, skip, and limit behavior;
- consistency between returned eligibility and rendered status;
- empty results and propagation of storage errors to the bot's error boundary;
- presence of the planned-query indexes in the Mongo schema.

### Scenario Integration Tests

At least one private-chat scenario covers a user joining one ride, marking
another as thinking, and then receiving both through `/planned` in nearest-first
order. The scenario also verifies that changing one ride to skipped removes it
when `/planned` is requested again.

Menu/help coverage verifies the English and Russian system command description,
help content, expanded button label, second-row position, and `main:planned`
callback.

Standard verification:

```bash
./run-tests.sh --mode basic
```

Mongo-specific verification for the new query and indexes is also required for
this feature:

```bash
./run-tests.sh --mode mongo
```

The Mongo command is part of the implementation acceptance criteria, but it is
run only when explicitly approved for that implementation session, in keeping
with the repository's default test policy.

## Commands

```bash
# Development
./scripts/devcontainer-exec.sh npm run dev

# Standard test suite
./run-tests.sh --mode basic

# Focused Mongo storage verification (explicit approval required)
./run-tests.sh --mode mongo
```

When a matching VS Code devcontainer is running, repository commands use
`scripts/devcontainer-exec.sh` or the project test wrapper as documented in
`AGENTS.md`.

## Boundaries

### Always

- derive the requester from `ctx.from.id`;
- evaluate the day boundary in the configured bot timezone;
- keep memory and Mongo storage behavior equivalent;
- fetch the displayed status without per-ride queries;
- preserve `/listrides` behavior;
- localize all visible English and Russian text;
- add the required focused, scenario, and storage coverage.

### Ask First

- change the participation state model;
- change the five-items-per-page convention;
- add a database migration beyond schema-managed indexes;
- add a dependency or modify CI/deployment configuration;
- change the persistent reply keyboard.

### Never

- include `skipped` or unregistered users' rides;
- exclude a ride only because it is cancelled or owned by the requester;
- use the current instant as the lower date boundary;
- pass Telegram framework objects into services or storage;
- perform one storage lookup per displayed ride;
- edit historical specifications after this feature is implemented.

## Success Criteria

The feature is complete when:

1. `/planned` in a private chat lists the requester's `joined` and `thinking`
   rides from the start of the current configured-timezone day onward.
2. Today's earlier rides, cancelled rides, and eligible creator-owned rides are
   included; earlier-day and skipped rides are excluded.
3. Results are nearest-first and paginated by five with working Previous, Next,
   and Close actions.
4. Each item matches the created-rides format except that the announcement line
   is replaced by the requester's accurate participation state.
5. A fresh command or page navigation reflects current participation without
   proactively editing any other already displayed `/planned` or `/listrides`
   messages; list messages are not synchronized like ride announcements.
6. The command appears in Telegram's command menu and localized help, and the
   expanded main menu places Planned rides first on its second row.
7. MongoDB has indexes supporting both eligible participation-state branches
   and ascending date filtering/sorting.
8. English and Russian behavior and text are covered by tests.
9. The basic suite passes, and the focused Mongo suite passes when explicitly
   run for implementation verification.

## Open Questions

None. The specification is ready for product review and approval.
