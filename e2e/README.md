# Telegram Full E2E

This directory contains the real Telegram end-to-end smoke test kit.

It is intentionally separate from the normal test suite:
- it uses a real Telegram user account
- it talks to the real development bot
- it sends real messages to Telegram chats
- it must not be included in `./run-tests.sh --mode basic`

## What It Covers

Current smoke scenario:
- create a ride in private chat with the bot
- share it to the configured group
- update it from private chat
- click `join`
- click `thinking`
- click `skip`
- delete the ride and verify the group message disappears

Current runner:
- [`run-e2e.js`](./run-e2e.js)
- [`run-e2e-full-stack.js`](./run-e2e-full-stack.js)

Current test:
- [`tests/ride-lifecycle.e2e.test.js`](./tests/ride-lifecycle.e2e.test.js)

## Prerequisites

You need:
- a working development bot token in `BOT_TOKEN`
- a real Telegram user account you control
- a Telegram API app from [my.telegram.org](https://my.telegram.org)
- one dedicated Telegram group for E2E verification

The E2E group should be treated as disposable test infrastructure.

## Required Environment Variables

Add these to your local `.env`:

```env
BOT_TOKEN=...
E2E_TELEGRAM_API_ID=...
E2E_TELEGRAM_API_HASH=...
E2E_PRIMARY_GROUP_ID=...
```

Optional:

```env
E2E_TELEGRAM_SESSION=...
E2E_TELEGRAM_SESSION_FILE=.e2e/telegram-user.session
```

Notes:
- if `E2E_TELEGRAM_SESSION` is not set, the kit will use the local session file
- bot username is resolved automatically through Bot API `getMe`
- the group ID may be configured either as the full Telegram peer ID like `-1003860911721` or a shorter internal-looking variant; the driver normalizes common forms

## Bootstrap the Telegram User Session

Run:

```bash
npm run e2e:bootstrap-session
```

This will:
- verify the bot token works
- resolve the bot username
- connect the MTProto client
- prompt for your Telegram phone number
- prompt for the login code
- prompt for 2FA password if enabled
- save the session locally to `.e2e/telegram-user.session`

Help:

```bash
npm run e2e:bootstrap-session -- --help
```

## Running the Smoke Test

### 1. Recommended: run the full E2E orchestrator

Use:

```bash
npm run e2e:run
```

This runner:
- starts the bot in development mode without file watching
- waits until the bot prints `Bike Ride Bot vX.X.X started in development mode`
- runs the Telegram E2E suite
- prints bot and test output in one console with clear prefixes
- stops the bot process after the suite finishes

### 2. Run the Telegram E2E test

If the bot is already running and you only want to execute the Telegram scenario:

```bash
npm run e2e:telegram
```

On success, the runner prints a line like:

```text
PASS ride lifecycle: H63d4hsHll7 (E2E Ride 1775731358626 Updated)
```

## Important Operational Rules

- Run E2E tests serially.
- Do not run them in the default test job.
- Keep the suite very small.
- Use explicit `chatId` targeting for group assertions.
- Prefer stable text fragments over exact full-message matches.
- Always clean up created rides when the scenario allows it.

## Directory Layout

- [`config.js`](./config.js): loads E2E config and session storage paths
- [`client/bot-api.js`](./client/bot-api.js): resolves bot metadata via Bot API
- [`client/telegram-user-client.js`](./client/telegram-user-client.js): wraps the real MTProto user session
- [`client/telegram-e2e-driver.js`](./client/telegram-e2e-driver.js): high-level user-facing E2E actions and waits
- [`fixtures/ride-fixtures.js`](./fixtures/ride-fixtures.js): test data builders
- [`tests/ride-lifecycle.e2e.test.js`](./tests/ride-lifecycle.e2e.test.js): first smoke scenario

## Writing New Telegram E2E Tests

Prefer tests that read like a user journey.

Good style:

```js
const checkpoint = await driver.captureChatCheckpoint({ chatId });
await driver.sendMessageToChat({ chatId, text: `/shareride #${rideId}` });
const message = await driver.waitForBotMessageInChat({
  chatId,
  afterMessageId: checkpoint,
  contains: title
});
```

Prefer:
- `sendPrivateCommand(...)`
- `sendMessageToChat({ chatId, ... })`
- `waitForBotMessageInChat({ chatId, ... })`
- `waitForEditedBotMessageInChat({ chatId, messageId, ... })`
- `clickButtonInChat({ chatId, messageId, ... })`

Avoid:
- raw MTProto calls inside test files
- generic `"group"` abstractions
- brittle assertions on full localized message bodies

## Troubleshooting

### `Telegram user session is not authorized`

Run:

```bash
npm run e2e:bootstrap-session
```

### `CHAT_ID_INVALID`

Check:
- the configured group is visible to the logged-in Telegram user
- the bot is actually present in that group
- `E2E_PRIMARY_GROUP_ID` points to the intended test group

### The test waits forever for a message or edit

Check:
- the bot can start locally with `NODE_ENV=development node src/index.js`
- the bot token in `.env` matches the Telegram bot you are messaging
- you are not using a production group by mistake
- the user session belongs to the account you expect
