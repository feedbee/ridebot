# `/unshareride` Announcement Removal

## Objective

Add a compact, confirmation-protected command that removes tracked ride announcements without deleting the ride or its private creator message.

## Behavior

- `/unshareride <ride ID>` in private removes every public announcement the caller may remove, across all chats.
- The same command in a public chat removes permitted announcements only from the current `chatId + messageThreadId` scope.
- `/unshareride` as a reply to an announcement removes that one tracked message.
- A reply to a forwarded announcement uses its original channel chat and message IDs. A hidden or unavailable origin is rejected.
- The ride creator may remove any announcement. A republisher may remove only announcements whose `publishedBy` is that user, and only while the ride allows reposts.
- Private creator messages are never selected.

Every operation shows the affected message/chat counts and confirm/cancel buttons. Public-chat commands send confirmation privately; failure to send it is ignored. Callback handling reloads the ride and rechecks permissions. The confirmation message is deleted and the result is returned as a short callback notification.

Successfully deleted and already-missing messages are removed from tracking. Other Telegram failures remain tracked and produce a partial-success result.

## Architecture

- `UnshareRideCommandHandler` resolves Telegram input, scope, permissions, confirmation, and localized responses.
- `RideMessagesService` owns Telegram deletion plus persistence cleanup.
- Existing ride message fields are sufficient; no migration or dependency is required.

## Commands

- Test: `./run-tests.sh --mode basic`
- Focused test: `npm test -- --runTestsByPath src/__tests__/commands/unshare-ride-command-handler.test.js`

## Code Style And Structure

Follow `docs/coding-preferences.md` and the existing command/service split. Keep callback state limited to ride ID, scope type, chat ID, and thread/message ID.

## Testing Strategy

Cover scope and ownership branches in command tests, cleanup outcomes in service tests, registration in bot tests, and one complete public-command/private-confirmation scenario.

## Boundaries

- Always preserve the ride and private creator message and recheck permissions on confirmation.
- Do not add storage schema changes, dependencies, retries, transactions, or background cleanup.
- Do not treat Telegram errors other than an explicit missing-message response as successful deletion.

## Success Criteria

All scope/permission combinations above work, confirmation is cleaned up, partial deletion is reported, stale tracking is removed, and the basic test suite passes.

## Open Questions

None.
