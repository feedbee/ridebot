# Specification: Debug Logging Of Telegram Conversations

## Status

Draft for review. No implementation work starts until this specification is approved.

## Objective

Add opt-in structured debug logging for Telegram conversations so an operator can:

- reconstruct what users sent to the bot and what the bot sent or changed in Telegram;
- distinguish private chats, groups, supergroups, topics, and channels;
- filter logs by Telegram user, chat, topic, update, direction, operation, and result;
- correlate one incoming update with every outgoing Telegram operation caused by it;
- see background bot messages even when they were not caused by an incoming update.

The feature is diagnostic only. It must not alter Telegram behavior or persist conversation data in application storage.

## Configuration

Add the environment variable:

```dotenv
DEBUG_LOG_MESSAGES=false
```

Expose it as a boolean configuration value named `config.debugLogMessages`.

- The feature is enabled only when the environment value is exactly `true`.
- A missing value, `false`, or any other value disables it.
- The default documented in `.env.example` is `false`.
- The value is read at process startup; runtime reconfiguration is out of scope.

When disabled, no conversation debug events are emitted and existing bot behavior remains unchanged.

## Output

Each event is written to stdout as one valid JSON object on one line. Conversation events use `console.log` or an injected equivalent output function. Pretty-printed or multiline output is not allowed because it makes ingestion and filtering unreliable.

All events have the following common fields:

```json
{
  "event": "telegram_conversation",
  "timestamp": "2026-08-27T12:34:56.789Z",
  "direction": "incoming",
  "operation": "message",
  "status": "success",
  "correlation_id": "telegram-update:123456",
  "update_id": 123456,
  "sender_user_id": 111,
  "recipient_user_id": null,
  "username": "alice",
  "chat_id": -100222,
  "chat_type": "supergroup",
  "chat_title": "Cycling Warsaw",
  "message_thread_id": 42,
  "message_id": 987,
  "text": "/newride tomorrow 10:00"
}
```

Fields that do not apply are emitted as `null`, rather than omitted, so log queries have a stable schema. Error-only fields are the exception described below.

### Filtering fields

- `direction`: `incoming` or `outgoing`.
- `operation`: normalized Telegram operation name.
- `status`: `success` or `error`.
- `correlation_id`: common identifier for one user interaction or background operation.
- `update_id`: Telegram update ID when the operation originates from an update.
- `sender_user_id`: Telegram user who sent an incoming message or pressed a button. For outgoing messages this is the initiating user when known, otherwise `null`.
- `recipient_user_id`: destination Telegram user for a private outgoing operation; otherwise `null`.
- `username`: incoming/initiating user's Telegram username when known, without making it a stable identity key.
- `chat_id`, `chat_type`, and `chat_title`: destination/source chat identity and kind.
- `message_thread_id`: Telegram topic ID when applicable.
- `message_id`: source or affected Telegram message ID when applicable.

Filtering a person's complete activity uses `sender_user_id=<id> OR recipient_user_id=<id>`. Numeric Telegram IDs are the authoritative filter; usernames may be absent or change.

## Incoming Events

### Text messages

Log the original text exactly as Telegram supplies it, without masking, truncation, HTML normalization, or command parsing.

- In a private chat, log every incoming text message delivered to the bot.
- In a group, supergroup, topic, or channel, log an incoming text message only if the bot reacts to it.
- For this feature, “reacts” means that processing the update attempts at least one logged outgoing Telegram operation. Merely receiving or inspecting the update does not count.
- A group/channel incoming event is emitted after update processing so ignored messages never enter the logs.
- The incoming event has `status=success`; failures of reactions appear on the corresponding outgoing events.

Telegram chat kinds remain distinct through `chat_type`: `private`, `group`, `supergroup`, or `channel`. Topics are represented by `chat_type=supergroup` plus `message_thread_id`.

### Button presses

Log callback queries handled by the bot as incoming events with:

- `operation=callback_query`;
- callback `data` stored in `text` exactly as received;
- the pressing user in `sender_user_id`;
- the source chat, topic, and message identifiers when present;
- the callback query ID in an additional `callback_query_id` field.

A callback event is logged even if handling ends in an error response. Inline callbacks without an attached chat use `chat_id=null` and retain all available callback identifiers.

### Media and other updates

Media payloads and non-text update types are out of scope. Do not log captions, file identifiers, file metadata, binary content, reactions, membership events, locations, contacts, polls, or the raw Telegram update.

## Outgoing Events

Log every attempted conversation-related Telegram operation after it settles:

- new text message: `operation=send_message`;
- text edit: `operation=edit_message_text`;
- message deletion: `operation=delete_message`;
- callback answer: `operation=answer_callback_query`.

This includes operations made through context helpers such as `ctx.reply`, `ctx.editMessageText`, `ctx.deleteMessage`, and `ctx.answerCallbackQuery`, as well as direct Telegram API calls made by services, wizards, handlers, and background notification flows.

Administrative startup calls such as webhook configuration and `setMyCommands` are not conversation operations and are not logged.

### Successful operations

On success:

- emit exactly one event with `status=success`;
- put sent/edited/callback text in `text` exactly as passed to Telegram;
- use the returned message ID when Telegram returns one, otherwise use the requested/affected message ID;
- record the destination chat and topic;
- preserve the original return value and behavior for the caller.

Successful deletion has `text=null`.

### Failed operations

On failure:

- emit exactly one event with `status=error`;
- include the attempted destination, operation, text, and identifiers;
- include `error_name`, `error_message`, and Telegram error code when available as `error_code`;
- do not serialize the complete error or request object because either may contain unrelated or sensitive implementation data;
- rethrow or return the failure exactly as the existing code path did before logging was added.

There is never a separate “attempt” event: each operation produces one final `success` or `error` event.

## Correlation

- Work caused by an incoming Telegram update uses `correlation_id=telegram-update:<update_id>`.
- All incoming and outgoing events caused synchronously by that update share the same correlation ID.
- Background operations without an update use a newly generated ID with prefix `background:`.
- One logical background notification and its resulting Telegram operation share the same generated correlation ID.
- `update_id` is `null` for background operations.

Correlation must not require passing raw Grammy context objects into application services. Context propagation belongs at the Telegram/infrastructure boundary.

## Architecture

The implementation should follow the existing layer boundaries:

- configuration parsing belongs in `src/config.js`;
- incoming update selection and update-scoped correlation belong in middleware registered by `src/core/Bot.js`;
- outgoing operation observation belongs at a shared Telegram boundary so context helpers and direct `ctx.api`/service API calls receive consistent logging;
- event construction/serialization should live in a small dedicated logging module, not in command handlers or business services;
- command handlers and services must not duplicate log-record construction.

The implementation may wrap Telegram context/API methods, but must preserve method arguments, `this` binding, returned promises/results, thrown errors, and the existing topic-aware behavior of `threadMiddleware`.

No new production dependency is expected. Adding one requires approval.

## Privacy And Data Handling

- Text and callback data are intentionally logged verbatim when the feature is enabled.
- Bot tokens, environment variables, full Telegram updates, complete errors, and media metadata are never logged.
- Logs are written only to stdout; there is no file sink, database collection, retention policy, or log rotation in this change.
- Operators are responsible for access control and retention of their runtime logging platform.
- The default-off configuration is the primary safeguard against accidental collection.

## Testing Strategy

Use Jest and the existing Telegram gateway/scenario testing patterns.

Required focused tests:

1. Configuration tests prove the default is `false`, exact `true` enables it, and other values do not.
2. Logger unit tests prove stable one-line JSON output, nullable fields, exact text preservation, and safe error extraction.
3. Middleware or Telegram-boundary tests prove:
   - private incoming text is logged;
   - ignored group text is not logged;
   - reacting group/topic text is logged with chat and topic fields;
   - callback data and pressing user are logged;
   - successful and failed send/edit/delete/callback-answer operations each produce one final event;
   - direct API and context-helper paths are covered;
   - background sends receive a generated correlation ID;
   - all operations caused by one update share its correlation ID;
   - logging disabled produces no conversation events.
4. Regression tests prove wrappers do not change returned values, thrown failures, or thread option propagation.

Default verification command:

```sh
./run-tests.sh --mode basic
```

Mongo mode is not required for this feature.

## Documentation

- Add `DEBUG_LOG_MESSAGES=false` to `.env.example`.
- Document that enabling the flag writes verbatim conversation content to stdout.
- Do not revise this document after the implementation has landed; later behavioral changes belong in living documentation or a new change specification.

## Boundaries

### Always

- Keep the feature disabled by default.
- Emit valid, single-line JSON with stable filter fields.
- Preserve Telegram behavior and error propagation.
- Cover all four outgoing operation types and both incoming types in tests.
- Keep logging concerns out of command handlers and business services.

### Ask first

- Add a production dependency.
- Introduce storage, files, remote log shipping, sampling, truncation, or masking.
- Expand logging to media or other Telegram update types.
- Change existing Telegram behavior to make logging easier.

### Never

- Log the bot token, environment, raw update, media payload, or complete error/request object.
- Enable conversation logging by default.
- Persist conversation logs in MongoDB or application storage as part of this change.
- Swallow or transform Telegram errors solely because logging is enabled.

## Acceptance Criteria

1. With `DEBUG_LOG_MESSAGES` absent or not equal to `true`, the application emits no `telegram_conversation` events.
2. With `DEBUG_LOG_MESSAGES=true`, all in-scope events produce one-line JSON records with the documented stable fields.
3. Private text and handled callback input is logged verbatim and filterable by Telegram user ID.
4. Group, supergroup, topic, and channel input is logged only when the bot attempts a reaction.
5. Every send, edit, delete, and callback answer is logged once after completion with `status=success|error`, including background operations.
6. Chat type, chat ID, topic ID, sender/recipient user IDs, and direction make private and public communication distinguishable and filterable.
7. All events caused by one update share `telegram-update:<update_id>`; background work has a unique `background:` correlation ID.
8. Media and unrelated Telegram updates do not produce conversation records.
9. Existing bot behavior and the basic test suite remain green.

## Open Questions

None. This draft assumes the answer “yes” to output-format question 10 means stdout with one-line JSON.
