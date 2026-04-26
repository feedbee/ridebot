# Specification: Ride Repost Permissions

## Overview

This change adds a ride setting that controls whether users other than the ride creator may repost a ride with `/shareride`.

The product goal is to let ride creators opt in to broader sharing when they want a ride to spread through the community, while keeping the default conservative: only the creator can repost their own rides.

The setting is part of the existing ride/user settings model:

- user defaults define the value copied into future rides
- each ride stores its own explicit settings snapshot
- changing user defaults later does not affect existing rides
- ride-specific settings can be changed through the existing `/settings` ride scope

---

## Goals

- Add an explicit ride setting for repost permission.
- Keep the default for users and rides as "reposts by other users are not allowed".
- Allow creators to opt in per future ride through user defaults.
- Allow creators to opt in or out per existing ride through ride settings.
- Make `/shareride` honor the setting when a non-creator attempts to repost.
- Keep the implementation aligned with the existing ride settings architecture.
- Keep settings callback routing extensible so future boolean settings do not require new callback families.

## Non-Goals

- Do not allow non-creators to change ride settings.
- Do not change participation, cancellation, deletion, or update ownership rules.
- Do not add a separate `/shareride` permission command.
- Do not make repost permission dependent on participation state, group membership, or chat admin status.
- Do not retroactively change existing rides based on later user-default changes.
- Do not redesign the `/settings` UX beyond adding this setting to the existing screen.

---

## Product Model

### Setting

Add a boolean ride setting:

```js
allowReposts: false
```

Meaning:

- `false`: only the ride creator may repost the ride with `/shareride`
- `true`: any user who knows the ride ID may repost the ride with `/shareride`

The setting controls repost permission only. It does not change:

- who may edit, cancel, resume, duplicate, or delete the ride
- who may view or join a shared ride message
- whether the bot has enough Telegram permissions to post in the target chat
- duplicate prevention when the ride is already posted in the same chat/topic

### Defaults

System default:

```js
allowReposts: false
```

User default:

```js
user.settings.rideDefaults.allowReposts
```

Ride snapshot:

```js
ride.settings.allowReposts
```

New users and users without stored defaults should see reposts disabled when opening `/settings`.

### Snapshot Semantics

When a ride is created, its `allowReposts` value is copied into `ride.settings` from the same settings resolution chain used for other ride settings:

1. explicit create-time setting, when provided by a supported entry point
2. user ride defaults
3. system defaults

After creation, the ride uses its own stored value. Later user-default changes apply only to future rides.

### Duplicate Semantics

Duplicating your own ride preserves the source ride's settings snapshot, including repost permission.

Duplicating another user's ride uses the duplicating user's current defaults, not the original creator's settings. This keeps another user's sharing preference from being silently inherited into a new creator's ride.

---

## User Experience

### `/settings`

The existing settings screen should include the repost permission alongside other ride settings.

User-default scope:

- shows whether future rides will allow reposts by other users
- offers a toggle to allow or forbid reposts for future rides

Ride scope:

- shows whether the selected ride allows reposts by other users
- offers a toggle to allow or forbid reposts for that ride
- remains creator-only

### `/shareride`

When a creator reposts their own ride, behavior remains unchanged.

When a non-creator uses `/shareride`:

- if `ride.settings.allowReposts` is `true`, the repost proceeds through the normal posting flow
- if `ride.settings.allowReposts` is `false`, the user receives the existing creator-only style rejection

The setting is checked before attempting to create a new ride message. A repost that passes this setting can still fail for existing reasons such as:

- cancelled ride
- ride already posted in the current chat/topic
- bot missing Telegram permissions
- target chat unavailable to the bot

---

## Architecture

### Settings Model

The new setting belongs to the existing `ride.settings` object and user `rideDefaults` object. It should reuse the shared settings default/snapshot logic rather than introducing a standalone repost-permission field.

The settings service remains the source of truth for:

- system defaults
- effective user defaults
- ride settings snapshots
- update-time settings merges

### Command Boundary

`/shareride` remains the Telegram-facing entry point for reposting rides.

The handler may perform command-specific permission checks because reposting is a Telegram-facing action, but it should read the effective ride setting through the existing settings abstraction instead of duplicating fallback logic.

### Settings UI Boundary

The settings command handler owns settings callback interpretation. Bot wiring should route generic settings callback shapes to the settings handler without knowing every supported setting.

The settings handler owns:

- mapping compact callback keys to setting names
- rejecting unknown setting keys
- applying boolean settings to user defaults or ride snapshots
- rendering the updated settings screen

This keeps callback registration stable as more boolean ride settings are added later.

### Bot Wiring

Bot callback registration should stay declarative and transport-focused.

It should recognize generic user-scope and ride-scope settings callbacks and delegate them to the settings handler. It should not own setting-name mappings or setting-specific branching.

### Storage

Persistent ride settings and user ride defaults should include the repost setting in the same nested settings objects as existing settings.

Legacy records that do not contain the setting should resolve through system defaults when a settings snapshot is built or backfilled.

---

## Text And AI Inputs

Power-user text flows that already support `settings.*` updates should support the repost setting using the same boolean parsing rules as other boolean settings.

AI ride creation/update flows may provide the structured setting when recognized, but the setting should remain optional. If omitted, normal settings defaults apply.

---

## Permissions And Safety

The default is deny because reposting can increase the visibility and reach of a ride beyond the creator's original audience.

Only the ride creator can change the setting for an existing ride. Non-creators can benefit from the setting only by reposting when the creator has explicitly allowed it.

The setting should not bypass Telegram platform constraints. Even when reposts are allowed, the bot must still be present and allowed to post in the target chat.

---

## Testing Expectations

Coverage should prove:

- system and user defaults include `allowReposts: false`
- new rides snapshot the setting from user defaults
- ride-level settings updates can toggle the setting
- non-creators are blocked from `/shareride` when reposts are forbidden
- non-creators can `/shareride` when reposts are allowed
- creator repost behavior remains unchanged
- duplicate-own vs duplicate-other settings semantics remain distinct
- settings callbacks are routed generically and interpreted by the settings handler
- unknown settings callback keys do not mutate stored settings

Scenario coverage should include at least one end-to-end settings journey that proves generic callback routing still updates persisted settings through the real bot wiring.

---

## Future Extension

This change should make additional boolean ride settings cheaper to add.

Future settings should be able to reuse the same product shape:

- system default
- user ride default
- ride snapshot
- generic boolean settings callback handling
- creator-only ride setting mutation

New settings should still define their own product semantics explicitly before being added to the shared settings UI.
