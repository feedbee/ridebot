# Specification: /joinchat Command and Group Chat Line in Ride Messages

## Overview

This change extends the group attachment feature with two improvements:

1. **Group chat line in ride messages** — when a group is attached to a ride, all ride messages (in all chats) display a notice telling participants how to join the group chat. The line disappears when the group is detached. Attaching or detaching a group triggers an update of all existing ride messages.

2. **`/joinchat` command** — a new private-only command that lets a ride participant request an invite link to the ride's group chat directly from the bot.

---

## Ride Message: Group Chat Line

### When shown

The line appears **only when `ride.groupId` is set**. When no group is attached, the line is absent with no extra blank lines.

### Placement

After the participants section (joined / thinking / not interested), before the footer (`🎫 #Ride #ID`), with one blank line between the participants section and the notice, and one blank line between the notice and the footer:

```
🙅 Not interested: 3

Join the ride's private group chat: send /joinchat #abc123 to the bot in private messages (only works if you have joined the ride).

🎫 #Ride #abc123
```

Without a group:

```
🙅 Not interested: 3

🎫 #Ride #abc123
```

### Template change

The `templates.ride` i18n key gets a `{groupChatLine}` placeholder inserted between the blank line and `{shareLine}`:

```
{groupChatLine}{shareLine}🎫 #Ride #{id}{cancelledInstructions}
```

### Formatter logic (`MessageFormatter.formatRideMessage`)

```javascript
const groupChatLine = ride.groupId
  ? `${this.translate('formatter.groupChatLine', { id: ride.id }, language)}\n\n`
  : '';
message = message.replace('{groupChatLine}', groupChatLine);
```

### Message update on attach / detach

- **`/attach`**: after saving `groupId`, all pre-existing ride messages are updated via `RideMessagesService.updateRideMessages`. The new message posted in the group is created with the `groupId` already set, so it immediately shows the notice.
- **`/detach`**: after clearing `groupId`, all ride messages are updated to remove the notice.

Both updates are best-effort (wrapped in try/catch with logging).

---

## `/joinchat` Command

### Context

**Private chat only.** (Registered in `Bot.js` under `privateOnly` commands.)

### Arguments

`rideId` — the ride ID, optionally prefixed with `#`. Parsed via the existing `RideMessagesService.extractRideId` utility.

### Success flow

1. Parse ride ID from command text
2. Fetch ride by ID — error if not found
3. Check `ride.groupId` is set — error if not
4. Check caller (`ctx.from.id`) is in `ride.participation.joined` — error if not
5. Call `GroupManagementService.addParticipant(ctx.api, ride.groupId, ctx.from.id, ctx.lang, ride.createdBy)`
   - Unbans the user (so previously-kicked users can accept a fresh link)
   - Creates a single-use invite link (24-hour expiry)
   - Sends the link to the user via DM
   - If the DM fails with 403 (user hasn't started the bot): notifies the ride creator instead

No reply is sent by the handler itself; `addParticipant` handles all messaging.

### Error cases

| Condition | i18n key |
|---|---|
| Ride ID missing or invalid | `commands.group.invalidRideIdUsage` |
| Ride not found | `commands.group.rideNotFound` |
| Ride has no attached group | `commands.group.joinchatNoGroup` |
| Caller not in `joined` list | `commands.group.joinchatNotParticipant` |

---

## i18n Keys

### New keys

#### `formatter.groupChatLine`

| Locale | Value |
|---|---|
| EN | `Join the ride's private group chat: send <code>/joinchat #{id}</code> to the bot in private messages (only works if you have joined the ride).` |
| RU | `Присоединяйтесь к закрытой группе поездки: напишите <code>/joinchat #{id}</code> боту в личные сообщения (работает только если вы записались в поездку).` |

#### `commands.group.joinchatNoGroup`

| Locale | Value |
|---|---|
| EN | `This ride doesn't have an attached group chat.` |
| RU | `К этой поездке не привязана группа.` |

#### `commands.group.joinchatNotParticipant`

| Locale | Value |
|---|---|
| EN | `You need to join the ride first.` |
| RU | `Сначала нужно записаться в поездку.` |

#### `bot.commandDescriptions.joinchat`

| Locale | Value |
|---|---|
| EN | `Join the private group chat for a ride` |
| RU | `Войти в закрытую группу поездки` |

### Updated `help2` template

Both locales get a new **💬 Joining the Ride Group Chat** section appended after the group attachment section.

---

## Implementation Details

### `GroupCommandHandler.handleAttach` changes

- Builds a local `rideWithGroupId = { ...ride, groupId }` after `updateRide` so that `createRideMessage` uses the ride object with `groupId` set (ensuring the new group message immediately shows the notice)
- After the participant-add loop, fetches the latest ride from storage and calls `updateRideMessages` (best-effort)

### `GroupCommandHandler.handleDetach` changes

- After `updateRide({ groupId: null })`, calls `updateRideMessages({ ...ride, groupId: null }, ctx)` (best-effort) before sending the success reply

### `GroupCommandHandler.handleJoinChat` (new method)

Delegates to `GroupManagementService.addParticipant` — no new membership logic is introduced; the same invite-link mechanism used by `ParticipationHandlers` is reused.

---

## Files Changed

| File | Change |
|---|---|
| `src/i18n/locales/en.js` | Add `formatter.groupChatLine`, `commands.group.joinchatNoGroup`, `commands.group.joinchatNotParticipant`, `bot.commandDescriptions.joinchat`; add `{groupChatLine}` to `templates.ride`; update `help2` |
| `src/i18n/locales/ru.js` | Same as EN |
| `src/formatters/MessageFormatter.js` | Compute and replace `{groupChatLine}` in `formatRideMessage` |
| `src/commands/GroupCommandHandler.js` | Update `handleAttach` (use `rideWithGroupId`, call `updateRideMessages` after attach); update `handleDetach` (call `updateRideMessages` before reply); add `handleJoinChat` |
| `src/core/Bot.js` | Register `/joinchat` as a `privateOnly` command |
| `src/__tests__/commands/group-command-handler.test.js` | Update attach/detach assertions; add `handleJoinChat` test suite |
| `src/__tests__/core/bot.test.js` | Update private command count (11 → 12) |
| `README.md` | Add "Joining the Ride Group Chat" section |
| `SPECIFICATION.MD` | Update `GroupCommandHandler` entry; add group chat line to formatter description |
| `docs/changes/joinchat-group-chat-line-specification.md` | This document |
