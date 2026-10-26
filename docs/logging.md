# Application Logging

The bot entrypoint (`src/index.js`) and database migration entrypoint
(`scripts/migrate.js`) initialize structured logging before application imports.
Existing `console` calls produce one JSON record per line, without pretty printing.

Each application record contains `level`, `time` (UTC ISO timestamp),
`service` (`ridebot`), and `msg`. Console methods map to these string levels:
`log` and `info` → `info`, `warn` → `warn`, `error` → `error`,
`debug` and `dir` → `debug`, and `trace` → `trace`.
Warnings and errors go to stderr; other levels go to stdout.

An exception passed as a separate argument is stored in `err`, including its
name, message, stack, cause, and custom properties such as Telegram method,
payload, description, and error code. Other arguments are stored in `data`.
Line breaks are escaped inside JSON strings so stack traces stay in one record.
Circular references are represented as `[Circular]`; bigint values become strings.
Invalid dates are represented as `null`, unreadable properties as
`[Unserializable]`, functions as `[Function]`, and nesting deeper than 32 levels
as `[Max depth]`. Serialization or output failures never interrupt application
operations.

```json
{"level":"error","time":"2026-10-26T08:35:10.317Z","service":"ridebot","msg":"Failed to update announcement","err":{"name":"Error","message":"Telegram failed","stack":"Error: Telegram failed\n    at ..."}}
```

Pass exceptions directly (`console.error('Update failed', error)`) to retain
their details. Logging only `error.message` retains only that string.

Existing `telegram_conversation` JSON records pass through unchanged. Their
opt-in configuration and schema remain independent of application log levels.
The `text` field preserves ordinary message text verbatim. When it is absent,
the conversation logger extracts readable content from `rich_message` HTML,
Markdown, or structured blocks, for incoming messages and outgoing sends/edits.
Rich headings, lists, tables, captions, and details are flattened to text with
line separators; links retain their targets. Media without text use a short
placeholder instead of dumping file IDs or transport metadata. `sendRichMessage`
uses the existing `send_message` operation. Deletes still have `text: null`.

Conversation records also contain `ride_id` when a known ride command, callback,
replied announcement, or outgoing announcement/keyboard provides an unambiguous
reference, including multiline `id:` parameters and `/airide #id` edits.
Generic actions and multi-ride lists have `ride_id: null`; IDs are not
guessed from arbitrary text or callback token positions. Each outgoing message
can reference its own ride, independently of the triggering update.

`source_chat_id`, `source_message_id`, and `source_message_thread_id` identify
the incoming message or callback source. The existing `chat_id`, `message_id`,
and `message_thread_id` identify the target of outgoing operations; a source
topic is only reused when the operation targets that exact source message or
answers its callback. An unknown destination topic stays `null`.
`correlation_id` groups one
update's operations; `update_id` is the Telegram delivery ID, not the ride ID.

Outgoing records add `api_method` and `duration_ms`. Both thrown transport errors
and Telegram responses with `ok: false` produce `status: error`, with error code,
description, `retry_after`, and `migrate_to_chat_id` when available. Successful
Bot API response envelopes are unwrapped for returned message/chat IDs. Logging
does not change the response returned to grammY or add API retries.
Malformed Rich Message content is ignored by diagnostic extraction rather than
preventing an API request or replacing its result/error.
Tests importing individual application modules do not install the global console
adapter; logging tests cover its output and entrypoint initialization separately.
Native Node.js diagnostics and output from shell/development tools are outside
the application console adapter.
