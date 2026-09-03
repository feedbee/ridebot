# Specification: Publishing A Ride To Recent Destinations

## Status

This document records the product and technical decisions embodied by the implemented change. It is the source of truth for the feature at the point when the change lands. As with other documents in `docs/changes/`, it becomes immutable after landing.

## Objective

Let a ride creator publish an announcement from the private creator copy of a ride without first navigating to a group and entering `/shareride` there.

The feature presents up to five recently used publication destinations, where a destination is either:

- a regular chat; or
- one topic inside a forum chat.

The creator can inspect each destination through a Telegram link and publish by pressing the corresponding numbered button. The implementation reuses publication history already stored in `ride.messages`; it does not introduce a destination registry, chat-membership discovery, a new collection, or a migration.

## Terminology

### Current ride publication

Any tracked message in the current ride's `messages` array for which `isForCreator !== true`.

### Recent publication

A non-creator tracked message belonging to any ride created by the current user. A message is eligible when:

- `publishedBy` equals the current user; or
- `publishedBy` is absent, for compatibility with messages stored before publication attribution was added.

### Destination

A destination is identified by:

```js
{
  chatId,
  messageThreadId: messageThreadId ?? null
}
```

The main chat and every topic in the same forum are different destinations.

## Entry Point And Access Rules

The private creator ride keyboard has a separate final row containing:

- Russian: `Публикация`
- English: `Publication`

Its callback is:

```text
rideowner:publish:<rideId>
```

The button is rendered only on a tracked creator-private ride message, using the existing `isForCreator` keyboard condition. It is not rendered on group announcements or another user's private ride copy.

Opening or using the menu requires the current user to remain the ride creator. A cancelled ride cannot be published and uses the existing localized cancelled-ride error.

## Menu Presentation

The bot sends the menu as a Rich Message with HTML content. It must use Rich Message methods supported by the project (`replyWithRichMessage` for creation and Rich HTML editing for refresh), not `ctx.replyWithHTML`.

### 1. Introductory section

The first section is always present.

Russian:

```text
Публикация анонса
Вы можете опубликовать анонс в любом чате, где есть бот, используя команду /shareride@<bot_username> #<rideId>
```

English:

```text
Publishing an announcement
You can publish the announcement in any chat where the bot is present using /shareride@<bot_username> #<rideId>
```

Requirements:

- the title is an `<h3>` heading;
- the instruction is a normal paragraph, not a list;
- the command is wrapped in `<code>`;
- the bot username comes from `ctx.me.username` when available;
- without a bot username, the fallback is `/shareride #<rideId>`;
- there is no full stop after the command, to make selection and copying easier.

### 2. Existing publications of the current ride

The heading is always present:

- Russian: `Анонс опубликован в чатах:`
- English: `Announcement published in chats:`

When the current ride has no group publications, show a one-item bullet list:

- Russian: `Анонс пока нигде не опубликован.`
- English: `This announcement has not been published anywhere yet.`

When publications exist:

- group them by destination (`chatId + normalized messageThreadId`);
- show one bullet per destination;
- show the destination label as plain text;
- append one link per tracked announcement as `[1]`, `[2]`, `[3]`, and so on;
- each numbered link points directly to that announcement message.

Example:

```text
• Ride Bot Dev / Тема #4 [1] [2]
• Ride Group [1]
```

### 3. Recent destinations

The heading is always present:

- Russian: `Опубликовать анонс в чатах (последние 5 публикаций):`
- English: `Publish announcement to chats (last 5 publications):`

When no eligible history exists, show a one-item bullet list:

- Russian: `Вы пока не делали публикаций анонсов.`
- English: `You have not published any announcements yet.`

When destinations exist:

- show an ordered list containing at most five unique destinations;
- keep the order from most recently used to least recently used;
- make the destination label a link when Telegram permits one;
- prefix the label with `✅ ` when the current ride already has a tracked publication in that exact destination;
- keep the check mark outside the link.

The ordered-list number corresponds to the inline button with the same number.

### 4. Destination labels

A regular chat is displayed as:

```text
Chat name
```

A forum topic is displayed using the numeric Telegram thread ID because the Bot API update/history available to this feature does not reliably provide the topic title:

```text
Chat name / Тема #4
Chat name / Thread #4
```

If a chat title is unavailable, use the localized `Unknown chat` / `Неизвестный чат` fallback.

### 5. Explanatory note

When at least one numbered publication button exists, end the message with an italic explanatory paragraph:

Russian:

```text
Нажмите на кнопку ниже, чтобы опубликовать анонс в выбранном чате. Если анонс в данном чате уже есть, сообщение продублируется.
```

English:

```text
Press a button below to publish the announcement in the selected chat. If the announcement is already there, the message will be duplicated.
```

An explicit visually empty Rich Text paragraph separates the ordered list from this note. The note is not a bullet-list item.

When there are no recent destinations and therefore no numbered buttons, omit the explanatory note and its spacer.

## Keyboard Layout

When recent destinations exist:

```text
1  2  3  4  5
✖ Close
```

There are as many numbered buttons as destinations. All numbered buttons occupy one row. The localized standard close button occupies its own final row.

When no recent destinations exist, show only the close button. The menu itself is still sent.

Callbacks use:

```text
ridepublish:<rideId>:<chatId>:<messageThreadId|main>
ridepublish:close
```

Closing deletes the menu only in a private chat and acknowledges the callback.

## Recent-Destination Selection

The storage interface exposes:

```js
getRecentPublicationDestinations(userId, limit)
```

The in-memory and MongoDB implementations follow the same rules:

1. Select rides where `createdBy === userId`.
2. Flatten their tracked messages.
3. Exclude creator-private messages.
4. Exclude messages explicitly attributed to a different publisher.
5. Use `message.publishedAt`, falling back to the ride's `createdAt` for legacy records.
6. Sort newest first; use message-array order as a deterministic fallback.
7. Deduplicate by `chatId + normalized messageThreadId`, retaining the newest occurrence.
8. Return no more than the requested limit; the menu requests five.

Before rendering, the handler calls `getChat(chatId)` for every selected destination. When successful, current `title` and `username` replace stale stored display metadata. Failure to hydrate one destination is non-fatal and stored metadata remains in use.

## Stored Message Metadata

Group publications may add these optional fields to existing `ride.messages` entries:

```js
{
  chatTitle,
  chatUsername,
  publishedBy,
  publishedAt
}
```

They supplement the existing fields:

```js
{
  chatId,
  messageId,
  messageThreadId,
  language,
  isForCreator
}
```

The metadata is written both for normal `/shareride` publications and publications initiated from this menu. All new fields are optional so existing documents remain valid. No migration or new collection is required.

## Telegram Links

### Public chats

For a chat with `chatUsername`, use:

```text
https://t.me/<username>/<messageId>
https://t.me/<username>/<threadId>
https://t.me/<username>/<threadId>/<messageId>
```

The second form opens a topic from the recent-destination list. The third form links directly to a published announcement inside a topic.

### Private supergroups

For IDs beginning with `-100`, remove that prefix and use:

```text
https://t.me/c/<internalChatId>/<messageId>
https://t.me/c/<internalChatId>/<threadId>
https://t.me/c/<internalChatId>/<threadId>/<messageId>
```

### Basic groups and missing metadata

When neither a public username nor a `-100` supergroup ID is available, omit the link while retaining the label and numbered publication button. The inability to construct a navigation link does not itself prevent publication.

## Publication Flow

When a numbered button is pressed:

1. Parse the ride, chat, and topic identity from the callback.
2. Reload the ride and verify creator ownership.
3. Reject cancelled rides.
4. Reload the creator's current top-five destinations.
5. Require the callback destination to match an item in that current list exactly. This prevents forged or expired callbacks from targeting arbitrary chats.
6. Apply the existing per-chat/topic rolling announcement limit through `cleanupRideMessagesForScope`.
7. Send the existing Rich ride announcement to the explicit `chatId`, including `message_thread_id` for a topic.
8. Store the new tracked message with destination metadata, `publishedBy`, and `publishedAt`.
9. Acknowledge the callback.
10. Edit the existing menu in place using the updated ride.

Publishing does not delete the menu and does not send a separate success message. Refreshing the menu adds another `[N]` direct-message link and applies the green check mark to the destination. Repeated publication to the same destination is intentional and duplicates the announcement, subject to the existing configured rolling limit.

## Failure Behavior

- Unknown ride or non-owner: reject using existing localized ownership/not-found behavior.
- Cancelled ride: reject using the existing repost-cancelled behavior.
- Destination no longer in the current top five: answer the callback with the localized expired-destination message.
- Required rolling-limit cleanup fails: do not publish and use the existing cleanup failure message.
- Telegram publication fails: log the error, do not add a tracked message, and use the existing localized failed-publication callback response.
- Chat metadata hydration fails: continue with stored metadata.
- Empty history: render the complete menu with both empty-state lists and only the close button.

## Architecture And Project Structure

- `src/formatters/MessageFormatter.js`
  - owns the localized creator-keyboard button and layout only;
- `src/commands/PublishRideCommandHandler.js`
  - owns Telegram callbacks, Rich HTML menu composition, access validation, link construction, and user-facing responses;
- `src/services/RideService.js`
  - exposes the framework-agnostic recent-destination query;
- `src/services/RideMessagesService.js`
  - creates and tracks a ride announcement in an explicit destination and reuses rolling-limit cleanup;
- `src/storage/interface.js`
  - documents the optional tracked-message metadata and storage query contract;
- `src/storage/memory.js` and `src/storage/mongodb.js`
  - implement identical selection semantics;
- `src/core/Bot.js`
  - registers the owner-menu, numbered-publication, and close callbacks;
- `src/i18n/locales/en.js` and `src/i18n/locales/ru.js`
  - contain all user-facing labels and messages.

Business persistence rules remain outside the command handler. No new dependency or infrastructure component is introduced.

## Localization And Escaping

- Every user-facing string has Russian and English variants.
- Chat titles, links, fallback text, bot usernames, and ride IDs are HTML-escaped before insertion into generated markup.
- Rich HTML uses native headings and list structures (`<h3>`, `<ul>`, `<ol>`, `<li>`) so Telegram does not collapse logical rows.
- The explanatory note uses `<i>` and a separate empty paragraph, not `<blockquote>`.

## Testing Strategy

### Handler tests

Cover:

- full Rich HTML with intro, current publications, direct links, recent destinations, checks, note, numbered buttons, and close row;
- both empty states and close-only keyboard;
- omission of the explanatory note when no numbered buttons exist;
- publication to a valid current destination;
- menu retention and in-place refresh after publication;
- rejection of forged/expired destinations;
- rejection of a non-owner;
- private close behavior.

### Formatter tests

Cover creator-only keyboard visibility and the localized `Publication` / `Публикация` button labels.

### Storage tests

Cover filtering, publisher attribution, recency ordering, topic-aware deduplication, the five-item limit, and compatibility with legacy message records.

### Service tests

Cover explicit-chat Rich Message sending, topic forwarding, metadata persistence, and interaction with the existing rolling announcement limit.

### Scenario tests

Cover the real bot callback wiring from private creator ride card through menu publication and menu refresh.

## Commands

Use the repository's devcontainer-aware command runner where applicable.

Focused tests:

```bash
./scripts/devcontainer-exec.sh npm test -- --runInBand src/__tests__/commands/publish-ride-command-handler.test.js
```

Required default verification:

```bash
./run-tests.sh --mode basic
```

Mongo-backed tests are not part of the default verification and must be run only when explicitly requested:

```bash
./run-tests.sh --mode mongo
```

Development:

```bash
./scripts/devcontainer-exec.sh npm run dev
```

## Boundaries

### Always

- revalidate ride ownership on every callback;
- revalidate a numbered destination against the current top-five list;
- distinguish the main chat from each forum topic;
- keep Russian and English text in sync;
- preserve existing rolling-limit behavior;
- escape dynamic Rich HTML values;
- keep the menu usable when history is empty.

### Ask first

- add a new collection or migration;
- increase or configure the five-destination UI limit;
- begin tracking general chat membership or activity independently of ride publications;
- resolve and persist human-readable forum topic titles through a new mechanism;
- change the existing per-chat/topic announcement retention limit.

### Never

- trust a chat ID supplied only by callback data;
- show the creator publication button in group announcements;
- infer that a user still belongs to a destination chat from publication history alone;
- claim that all shared chats can be discovered through the Bot API;
- remove or replace historical specifications after their changes have landed.

## Non-Goals And Known Limitations

- Discovering every chat where both the user and bot are members.
- Sorting by arbitrary chat activity or the user's most recent ordinary message.
- Showing human-readable topic names; topics use numeric IDs.
- Providing search, pagination, or more than five recent destinations.
- Proving that the user or bot is still a member of a historical destination before the send attempt.
- Guaranteeing navigation links for basic groups.
- Preventing intentional repeated announcements in the same destination.
- Adding transactions or locks for concurrent publication attempts.

## Success Criteria

- The creator-private ride card has a localized `Publication` / `Публикация` button in its own final row.
- Pressing it always opens a localized Rich HTML menu, even with no history.
- The menu accurately lists and links every tracked publication of the current ride by destination.
- The menu shows at most five unique recent chat/topic destinations in reverse chronological order.
- Topic and main-chat destinations remain distinct.
- Every numbered button maps to the correspondingly numbered destination.
- Forged, stale, non-owner, and cancelled-ride callbacks cannot publish.
- A successful publication appears in the target chat/topic, is tracked, and refreshes the existing menu without deleting it.
- Empty states use one-item bullet lists; the explanatory note appears only when numbered buttons exist.
- Russian and English presentations remain semantically equivalent.
- The basic test suite passes.

## Open Questions

None for the implemented scope.
