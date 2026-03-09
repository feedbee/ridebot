# Specification: Telegram Group Attachment for Rides

## Overview

This feature allows ride creators to attach an existing Telegram group to a ride. Once attached, the bot automatically adds users to the group when they join the ride, and removes them when they change their status to "Thinking" or "Pass".

---

## User Flow

1. Ride creator creates a group in Telegram
2. Creator adds the bot to the group and grants it **admin** permissions with at least:
   - "Add members" (invite users)
   - "Ban users" (remove members)
   - "Pin messages"
3. Creator sends `/attach #rideId` **in the group chat**
4. Bot verifies permissions, attaches the group, posts the ride message, and pins it
5. From this point, participation changes automatically sync group membership
6. To unlink, creator sends `/detach` in the group chat

---

## Commands

### `/attach #rideId`

**Context:** Must be sent in a group/supergroup chat (not private)

**Arguments:** `rideId` — the ride ID, optionally prefixed with `#`

**Success flow:**
1. Parse rideId (strip `#`)
2. Fetch ride — error if not found
3. Verify caller is ride creator — error if not
4. Verify ride does not already have a group attached — error if so (must `/detach` first)
5. Fetch bot's membership in the current chat (`getChatMember(chatId, botId)`)
6. Verify bot status is `administrator` — error if not
7. Verify bot has `can_invite_users` permission — error if missing
8. Save `groupId = ctx.chat.id` to ride
9. Post ride message in the group (via `RideMessagesService.createRideMessage`) — tracked in `ride.messages`
10. Pin the posted message (`pinChatMessage`) — best-effort, log if fails
11. Add all currently `joined` participants to the group (best-effort, see "Adding users" below)
12. Reply: success message

**Error cases:**
- Called in private chat → `commands.group.notInGroup`
- Ride not found → `commands.group.rideNotFound`
- Caller is not ride creator → `commands.group.notCreator`
- Ride already has a group attached → `commands.group.alreadyAttached`
- Bot is not an admin → `commands.group.botNotAdmin`
- Bot lacks `can_invite_users` → `commands.group.botNeedsAddMembersPermission`

---

### `/detach`

**Context:** Must be sent in the group that is attached to a ride

**Success flow:**
1. Look up ride by `groupId = ctx.chat.id`
2. Error if no ride is attached to this group
3. Verify caller is ride creator OR a Telegram group admin (`getChatMember`)
4. Clear `groupId` on the ride (`updateRide({ groupId: null })`)
5. Reply: success message

**Error cases:**
- Called in private chat → `commands.group.notInGroup`
- No ride attached to this group → `commands.group.noGroupAttached`
- Caller is not authorized → `commands.group.notCreator`

---

## Auto Group Membership Sync

Triggered from `ParticipationHandlers.handleParticipationChange` after a successful participation update.

**Condition:** `ride.groupId` is set

**Logic:**
- `previousState` was `joined` AND new `state` ≠ `joined` → **remove** user from group
- New `state` is `joined` → **add** user to group
- Otherwise (e.g., thinking → skipped) → no action

### Adding users (`GroupManagementService.addParticipant`)

> **Note:** The Telegram Bot API does not provide a method to directly add users to groups. The only mechanism available to bots is invite links.

1. Call `api.unbanChatMember(groupId, userId)` — allows previously-kicked (banned) users to accept the invite link
2. If the error is `"can't remove chat owner"`, silently return — the group owner is already a member and cannot be banned/unbanned
3. Create a single-use invite link expiring in 24 hours: `api.createChatInviteLink(groupId, { member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + 86400 })`
4. Send the link to the user via DM: `api.sendMessage(userId, ...)` using translation key `commands.group.inviteLinkSent`
5. On any other error: log and continue (do not throw)

### Removing users (`GroupManagementService.removeParticipant`)

1. Call `api.banChatMember(groupId, userId)` — kicks and bans the user
2. The user remains banned until they re-join the ride, at which point `addParticipant` calls `unbanChatMember` before sending a fresh invite link
3. On errors: log and continue (do not throw)

---

## Data Model Changes

### `Ride` (storage interface + both backends)

New optional field:
```
groupId: number | null  — Telegram chat ID of the attached group
```

### New storage method

```
getRideByGroupId(groupId: number): Promise<Ride | null>
```

Returns the ride with `groupId` equal to the given value, or `null` if not found.

---

## API Limitations

**"Show chat history for new members"** — Telegram Bot API does not expose a method to toggle the group setting that allows new members to see message history. The workaround is **pinning the ride message** in the group immediately after posting it, so it is always visible regardless of chat history settings.

---

## i18n Keys

### `bot.commandDescriptions`
| Key | EN |
|---|---|
| `attach` | `Attach a Telegram group to a ride` |
| `detach` | `Detach the Telegram group from its ride` |

### `commands.group`
| Key | EN |
|---|---|
| `notInGroup` | `This command must be used in a group chat.` |
| `rideNotFound` | `Ride not found.` |
| `notCreator` | `Only the ride creator can perform this action.` |
| `alreadyAttached` | `This ride already has a group attached. Use /detach first.` |
| `botNotAdmin` | `The bot is not an admin in this group. Please make it an admin and try again.` |
| `botNeedsAddMembersPermission` | `The bot needs the "Add Members" admin permission. Please update the bot's permissions and try again.` |
| `attachSuccess` | `Group attached successfully! Participants will be automatically added when they join the ride.` |
| `detachSuccess` | `Group detached. Participants will no longer be auto-added.` |
| `noGroupAttached` | `No ride is attached to this group.` |
| `inviteLinkSent` | `You've been invited to the ride group: {link}\n\nThis group is for ride coordination, pre- and post-ride discussion, and sharing photos. The link is valid for 24 hours.` |

---

## Help Text Addition (`help2` template)

Add a new section after the "📢 Sharing a Ride" section:

```
📎 Attaching a Group to a Ride
Only the ride creator can attach a group:
1. Create a Telegram group and add the bot as admin (needs "Add Members" and "Ban Users" permissions)
2. Use /attach with ride ID in the group chat: /attach #abc123
The bot will post the ride info in the group and automatically add/remove members as participants join or leave the ride.
To unlink the group, use /detach in the group chat.
```

---

## Files Changed

| File | Type | Change |
|---|---|---|
| `docs/changes/group-attachment-specification.md` | New | This document |
| `src/storage/interface.js` | Modified | Add `groupId` to Ride typedef; add `getRideByGroupId` |
| `src/storage/mongodb.js` | Modified | Add `groupId` to schema; implement `getRideByGroupId` |
| `src/storage/memory.js` | Modified | Implement `getRideByGroupId` |
| `src/services/RideService.js` | Modified | `setParticipation` returns `previousState` |
| `src/services/GroupManagementService.js` | New | `addParticipant`, `removeParticipant` |
| `src/commands/GroupCommandHandler.js` | New | `/attach` and `/detach` handlers |
| `src/commands/ParticipationHandlers.js` | Modified | Call `GroupManagementService` after participation change |
| `src/core/Bot.js` | Modified | Register `/attach`, `/detach`; inject `GroupManagementService` |
| `src/i18n/locales/en.js` | Modified | Add all new keys; update `help2` |
| `src/i18n/locales/ru.js` | Modified | Same keys in Russian |
| `src/__tests__/commands/group-command-handler.test.js` | New | Unit tests |
| `src/__tests__/services/group-management-service.test.js` | New | Unit tests |
| `src/__tests__/commands/participation-handlers.test.js` | Modified | Update mocks; add group sync tests |
| `src/__tests__/services/ride-service.test.js` | Modified | Test `previousState` return |
| `src/__tests__/storage/memory-storage.test.js` | Modified | Test `getRideByGroupId` |
