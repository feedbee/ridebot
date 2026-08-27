# Specification: Multiple Ride Announcements Per Chat And Thread

## Overview

Allow `/shareride` to publish another announcement for a ride even when that ride already has tracked messages in the current Telegram chat or forum topic.

The bot may track up to a configurable number of announcements for the same ride in the same chat/topic scope. The default limit is 5. Before `/shareride` publishes a message that would exceed the limit, it removes the oldest tracked messages in that scope. All remaining messages continue to receive the existing synchronized ride updates.

## Objective

Users sometimes need to surface the same ride more than once in a busy chat or topic. The current duplicate check prevents this after the first announcement.

This change replaces that binary duplicate rule with a bounded rolling set of announcements so that:

- the same ride can be announced repeatedly in one chat or topic;
- every retained announcement remains synchronized;
- old announcements do not accumulate without a bound;
- a Telegram deletion failure does not allow the bot to exceed the configured limit knowingly.

## Terminology And Scope

### Announcement scope

An announcement scope is the pair:

```js
{
  chatId,
  messageThreadId
}
```

`messageThreadId` is normalized to `null` when the message is not in a forum topic.

Consequences:

- different chats have independent limits;
- different topics in the same forum chat have independent limits;
- the main chat (`messageThreadId: null`) is independent from every topic;
- the limit is also independent per ride.

### Counted messages

The count includes every tracked entry in `ride.messages` that belongs to the current announcement scope, regardless of how that message was originally created. No source/type field is required on a message record.

The limit is enforced only when handling `/shareride`. Other flows that create ride messages keep their current behavior and do not proactively enforce this limit.

## Configuration

Add an application configuration value:

```js
config.maxRideMessagesPerChatThread
```

It is populated from:

```text
MAX_RIDE_MESSAGES_PER_CHAT_THREAD
```

Rules:

- default: `5`;
- accepted value: a positive integer;
- missing, non-numeric, non-integer, zero, or negative values fall back to `5`;
- the value is a deployment-level setting, not a user or ride setting.

## `/shareride` Behavior

Existing ride lookup, repost permission, cancellation, formatting, localization, and Telegram permission behavior remain in force.

After those validations and before creating the new announcement, `/shareride` performs the following steps:

1. Select tracked messages for the requested ride whose normalized `chatId + messageThreadId` matches the current command context.
2. Preserve their order from `ride.messages`; the first matching entry is the oldest.
3. Calculate how many existing messages must be removed so that adding one new message will leave no more than the configured limit:

   ```js
   removalCount = Math.max(0, scopedMessages.length - limit + 1);
   ```

4. Attempt to delete the first `removalCount` scoped messages from Telegram, oldest first.
5. Remove each successfully handled old message from persistent tracking.
6. Only after every required old message has been handled, publish and track the new announcement using the existing ride-message flow.

This also defines behavior after a configuration reduction. For example, if eight messages exist and the limit becomes five, the next `/shareride` removes the four oldest messages before publishing the new one, leaving five.

When the scoped count is below the configured limit, `/shareride` does not delete anything and publishes another announcement normally.

The existing `alreadyPostedInChat` rejection is removed from this flow. Reposting below the limit should not generate an extra confirmation or informational reply.

## Old-Message Deletion Outcomes

### Deleted successfully

When Telegram deletes an old message successfully:

- remove its exact record from `ride.messages`;
- continue with any other required removals;
- do not send an additional user-facing notification.

### Already absent in Telegram

When Telegram reports that an old message no longer exists, treat the deletion as successful drift cleanup:

- remove its exact record from `ride.messages`;
- continue the operation;
- allow the new announcement after all required removals have been handled.

The Telegram error classification must be narrow enough to distinguish a missing message from permission, connectivity, rate-limit, and other failures.

### Deletion failed for another reason

When any required old message cannot be deleted for a reason other than already being absent:

- do not publish the new announcement;
- show a localized error explaining that the announcement limit has been reached and the oldest message could not be removed;
- preserve the failed old message in tracking;
- preserve the removal from tracking of any earlier messages that were successfully deleted during the same attempt.

It is acceptable for this failure path to leave fewer messages than the configured limit. There is no rollback and the bot must not recreate already deleted messages.

### New publication failed after cleanup

If all required old messages were deleted but creation of the new announcement fails:

- retain the cleanup already performed in Telegram and in `ride.messages`;
- use the existing localized `/shareride` publication error behavior;
- do not restore deleted messages.

It is acceptable for the scope to contain one or more fewer messages afterward.

## Synchronization

All retained records in `ride.messages` continue through the existing `RideMessagesService.updateRideMessages` behavior. Ride edits, cancellation/resumption, participation changes, attached-group presentation changes, and deletion of the ride continue to affect every tracked message.

Evicted messages are removed from tracking and therefore receive no future synchronization attempts.

The feature does not change the existing cleanup performed when synchronization discovers unavailable tracked messages.

## Ordering And Persistence

The order of entries in `ride.messages` is the source of truth for age. No message timestamp or migration is introduced.

Deletion targets must be identified by the complete stored message identity used by the current code:

```js
{
  chatId,
  messageId,
  messageThreadId
}
```

Removing an entry must not remove messages with the same chat or thread but a different `messageId`.

Persistent tracking must reflect every successfully handled deletion even when a later deletion or the new publication fails. The implementation may persist after each deletion or persist the accumulated successful deletions before returning, as long as this observable guarantee holds.

## Concurrency

Strict enforcement across concurrent `/shareride` requests is out of scope. A simple read-delete-update-create sequence is sufficient. No database transaction, lock, compare-and-swap operation, or new uniqueness constraint is required.

Each individual request must still follow the specified ordering: required deletion first, new publication second.

## Architecture

### Command handler

`ShareRideCommandHandler` remains the Telegram-facing entry point and owns the decision to apply the limit only for `/shareride`.

It should not duplicate low-level tracked-message deletion and persistence orchestration if that behavior can live in `RideMessagesService` as a reusable message lifecycle operation.

### Ride message service

`RideMessagesService` remains responsible for Telegram ride-message creation, deletion-related tracking changes, and synchronization. The service should expose a structured outcome that lets the command handler distinguish:

- cleanup succeeded and publication may proceed;
- cleanup was unnecessary;
- cleanup failed and publication must be blocked.

Service APIs should use application data and explicit Telegram collaborators already established in the project; this feature does not justify a broader architecture change.

### Storage

The existing `ride.messages` array is sufficient. No storage schema change or migration is required.

## Localization And User Experience

Add localized English and Russian text for the blocking cleanup failure. Its meaning should be:

> The announcement limit for this chat or topic has been reached, and the oldest announcement could not be removed. The new announcement was not published.

Exact wording may follow existing locale style. Do not expose raw Telegram error details in this message.

No success notification is added when an old announcement is deleted. Existing `/shareride` success behavior remains unchanged.

## Testing Strategy

### Focused command/service tests

Cover at least:

- two or more announcements can be published in the same chat with `messageThreadId: null`;
- messages below the limit are not deleted;
- at the limit, the oldest matching message is deleted before the new message is created;
- only messages belonging to the same ride and exact chat/topic scope are counted;
- main-chat and forum-topic scopes are independent;
- two topics in the same chat are independent;
- all excess oldest messages are deleted when the configured limit is reduced;
- a Telegram “message not found” result removes stale tracking and permits publication;
- a non-missing deletion failure blocks publication and produces the localized limit/deletion error;
- successful deletions earlier in a multi-delete attempt remain removed when a later deletion fails;
- failure to create the new announcement does not restore messages already deleted;
- eviction removes only the exact targeted tracked records;
- retained announcements continue to be synchronized by existing update behavior;
- repost ownership/settings and cancelled-ride checks remain unchanged.

Configuration tests must cover:

- an explicit positive integer;
- the default when the environment value is missing;
- fallback for non-numeric, non-integer, zero, and negative values.

### Scenario integration test

Add at least one scenario through real bot wiring and in-memory persistence:

1. Start with the limit set to a small test value.
2. Publish the same ride repeatedly through `/shareride` in the same scope.
3. Verify that publication below the limit succeeds.
4. Verify that the next publication deletes the oldest Telegram message first.
5. Verify that persisted `ride.messages` contains only the retained announcements.
6. Change the ride or its participation and verify that every retained announcement is updated.

The scenario may use a small configured limit rather than creating 11 messages.

### Standard verification command

```bash
./run-tests.sh --mode basic
```

Mongo mode is not required because this feature does not change the persistence schema or introduce Mongo-specific behavior.

## Project Structure

Expected areas of change:

```text
src/config.js
  Deployment-level announcement limit and validation.

src/commands/ShareRideCommandHandler.js
  `/shareride` policy and user-facing result mapping.

src/services/RideMessagesService.js
  Scoped oldest-message cleanup and tracking persistence.

src/i18n/locales/en.js
src/i18n/locales/ru.js
  Localized cleanup failure message.

src/__tests__/
  Focused service/handler and scenario coverage.
```

This list is directional rather than a requirement to modify every named file. Reuse existing test and service locations where appropriate.

## Boundaries

### Always

- Normalize absent `messageThreadId` values to `null` for scope comparisons.
- Count all tracked messages in the target scope regardless of their creation path.
- Delete enough oldest messages to make room under the current configured limit.
- Persist removal of every message successfully deleted or confirmed already absent.
- Block the new publication on any other required-deletion failure.
- Keep all retained announcements synchronized through the existing mechanism.
- Run the basic test suite.

### Ask first

- Introducing message timestamps or source/type metadata.
- Adding storage transactions, locking, or strict concurrency enforcement.
- Applying the limit to message-creation flows other than `/shareride`.
- Changing repost permissions or cancelled-ride behavior.

### Never

- Publish the new `/shareride` announcement before required cleanup completes.
- Delete announcements from another ride, chat, or topic scope.
- Treat permission, network, or rate-limit errors as proof that a message is already absent.
- Roll back by recreating successfully deleted Telegram messages.
- Run Mongo-based tests unless explicitly requested.

## Acceptance Criteria

1. A ride can have multiple synchronized announcements in the same Telegram chat or topic.
2. `/shareride` permits another announcement while the scoped count is below the configured limit.
3. Before a publication that would exceed the limit, the bot removes enough oldest scoped messages to leave exactly the configured maximum after successful publication.
4. Messages in other chats or topics do not affect the current scope's limit.
5. An already absent oldest message is cleaned from tracking and does not block publication.
6. Any other required-deletion failure prevents the new publication and produces the localized limit/deletion error.
7. A new-message creation failure after cleanup leaves successfully deleted messages deleted and untracked.
8. The default maximum is 5, and every invalid configured value falls back to 5.
9. Other message-creation flows do not start enforcing the new limit.
10. Existing synchronization, repost permissions, cancellation checks, and ride deletion behavior remain functional.
11. `./run-tests.sh --mode basic` passes.

## Non-Goals

- Strict correctness under concurrent `/shareride` requests.
- A per-user or per-ride configurable limit.
- Scheduled cleanup of old announcements without a new `/shareride` request.
- Backfilling timestamps or publication sources.
- Applying the limit globally across chats or topics.
- Applying the limit proactively to `/newride`, `/attach`, duplication, or other publication flows.
- Restoring announcements after partial cleanup or publication failure.

## Resolved Decisions

- The limit is per ride and per `chatId + messageThreadId` scope.
- The default and fallback limit is 5.
- All tracked messages in the scope count, regardless of their origin.
- Only `/shareride` enforces the limit.
- Required old messages are deleted before the new message is sent.
- Array position determines message age.
- Missing Telegram messages are successful drift cleanup.
- Other deletion errors block the new publication.
- Reducing the configured limit causes all necessary excess messages to be removed on the next `/shareride`.
- Topics are independent scopes.
- Strict concurrent enforcement is not required.

## Open Questions

None.
