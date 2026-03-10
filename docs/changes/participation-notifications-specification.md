# Specification: Participation Notifications

## Overview

Ride creators can opt in to receive a private Telegram DM whenever a participant joins, starts thinking about, or declines their ride. Notifications are debounced: if the same participant changes status multiple times within 30 seconds, only one message is sent reflecting the final state. The preference is stored per-ride and defaults to **yes**.

---

## User Flow

1. Creator starts `/newride` (wizard mode) or uses the parametrized command
2. After the "Additional info" step, a new **"Participation notifications"** step appears with Yes / No buttons (default: Yes)
3. Creator chooses Yes or No and proceeds to the confirmation screen
4. Confirmation screen includes a "🔔 Participation notifications" row showing the chosen value
5. After the ride is created, whenever a participant changes their status the creator receives a DM within 30 seconds

---

## Wizard Step: `notify`

Inserted between `info` and `confirm`.

**Position in flow:** title → category → organizer → date → route → distance → duration → speed → meet → info → **notify** → confirm

**Prompt:** `🔔 Notify you when participants join or leave?`

**Input method:** Inline keyboard buttons only (no text input accepted for this step)

| Button | Action | Effect |
|--------|--------|--------|
| Yes | `wizard:notifyYes` | Sets `notifyOnParticipation = true`, advances to confirm |
| No | `wizard:notifyNo` | Sets `notifyOnParticipation = false`, advances to confirm |
| ← Back | `wizard:back` | Returns to `info` step |
| Cancel | `wizard:cancel` | Cancels the wizard |

**Properties:**
- `required: true` — the step is always shown; the user must choose Yes or No
- `skippable: false` — no skip button
- `clearable: false` — no clear button
- Default value: `true` (set when wizard starts, shown as current value)

**Back from confirm:** The back button on the confirm screen now goes to `notify` (previously went to `info`).

---

## Parametrized Mode

A `notify` parameter is accepted in `/newride`, `/updateride`, and `/dupride` text-based input.

**Accepted values:**

| Input | Result |
|-------|--------|
| `yes`, `true`, `1` | `notifyOnParticipation = true` |
| `no`, `false`, `0` | `notifyOnParticipation = false` |

**Default:** `true` (when `notify` param is omitted).

**Example:**
```
/newride
title: Morning Gravel
when: Saturday 8am
notify: no
```

**Duplicate ride:** When duplicating via wizard or params mode, the `notifyOnParticipation` preference is copied from the original ride (unless `notify` is explicitly provided).

---

## Notification DMs

Sent to `ride.createdBy` (the creator's Telegram user ID) as a private message.

### Conditions for sending

| Condition | Behaviour |
|-----------|-----------|
| `ride.notifyOnParticipation === false` | No notification sent |
| Participant is the ride creator | No notification sent (self-join suppressed) |
| All other cases | Notification scheduled |

### Message templates

| State | Template (EN) |
|-------|---------------|
| `joined` | `🚴 <b>{name}</b> joined your ride "<b>{title}</b>"` |
| `thinking` | `🤔 <b>{name}</b> is thinking about your ride "<b>{title}</b>"` |
| `skipped` | `🙅 <b>{name}</b> declined your ride "<b>{title}</b>"` |

**Participant name format:** `First Last (@username)` when both name and username are available; falls back to `username (@username)`, then `First` alone with `(@username)`, then `Someone` if no data.

**Language:** Bot default language (creator's personal language preference is not stored; can be improved in a future iteration).

---

## Debounce Behaviour

- Each pending notification is keyed by `${rideId}:${participantUserId}`
- When a notification is scheduled, any existing pending timer for the same key is cancelled and replaced
- The 30-second timer starts fresh on each state change
- Only the **final** state within the debounce window is sent
- On successful send the timer entry is removed from the map

**Example:** Alice clicks Join, then Thinking, then Skip within 10 seconds → only one DM arrives ~30s after the last click, saying she declined.

---

## Data Model Changes

### `Ride`

New optional field:

```
notifyOnParticipation: boolean  — default: true
```

Existing rides without this field are treated as `true` (`?? true` fallback; no migration needed).

---

## i18n Keys

### `commands.notifications`

| Key | EN | RU |
|-----|----|----|
| `joined` | `🚴 <b>{name}</b> joined your ride "<b>{title}</b>"` | `🚴 <b>{name}</b> присоединился к вашей поездке "<b>{title}</b>"` |
| `thinking` | `🤔 <b>{name}</b> is thinking about your ride "<b>{title}</b>"` | `🤔 <b>{name}</b> думает о вашей поездке "<b>{title}</b>"` |
| `skipped` | `🙅 <b>{name}</b> declined your ride "<b>{title}</b>"` | `🙅 <b>{name}</b> отказался от вашей поездки "<b>{title}</b>"` |

### `wizard.prompts`

| Key | EN | RU |
|-----|----|----|
| `notify` | `🔔 Notify you when participants join or leave?\n<i>You can change this later by updating the ride.</i>` | `🔔 Уведомлять вас, когда участники присоединяются или выходят?\n<i>Это можно изменить позже через обновление поездки.</i>` |

### `wizard.confirm.labels`

| Key | EN | RU |
|-----|----|----|
| `notify` | `🔔 Participation notifications` | `🔔 Уведомления об участниках` |

### `params`

| Key | EN | RU |
|-----|----|----|
| `notify` | `Notify on participation changes (yes/no)` | `Уведомлять об изменениях участников (yes/no)` |

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `docs/changes/participation-notifications-specification.md` | New | This document |
| `src/services/NotificationService.js` | New | Debounced DM service: `scheduleParticipationNotification`, `_sendNotification`, `_formatName` |
| `src/storage/interface.js` | Modified | Add `notifyOnParticipation` to `Ride` typedef |
| `src/storage/mongodb.js` | Modified | Add `notifyOnParticipation` to schema and `mapRideToInterface` |
| `src/wizard/wizardFieldConfig.js` | Modified | Add `FieldType.BOOLEAN`; add `notify` field; change `info.nextStep` to `'notify'`; update `buildRideDataFromWizard` and `getConfirmationFields` |
| `src/wizard/RideWizard.js` | Modified | Add `sendNotifyStep`; handle `notifyYes`/`notifyNo` actions; fix back-from-confirm to go to `notify` |
| `src/commands/ParticipationHandlers.js` | Modified | Accept `notificationService` (4th param); call `scheduleParticipationNotification` on success |
| `src/commands/UpdateRideCommandHandler.js` | Modified | Prefill `notifyOnParticipation` from existing ride in update wizard |
| `src/commands/DuplicateRideCommandHandler.js` | Modified | Prefill `notifyOnParticipation` from original ride in duplicate wizard |
| `src/services/RideService.js` | Modified | `duplicateRide`: copy `notifyOnParticipation` from original when `notify` param is absent |
| `src/utils/FieldProcessor.js` | Modified | Parse `notify` param → `notifyOnParticipation` boolean |
| `src/utils/RideParamsHelper.js` | Modified | Register `notify` as a valid param |
| `src/core/Bot.js` | Modified | Instantiate `NotificationService`; pass to `ParticipationHandlers` |
| `src/i18n/locales/en.js` | Modified | Add `commands.notifications`, `wizard.prompts.notify`, `wizard.confirm.labels.notify`, `params.notify` |
| `src/i18n/locales/ru.js` | Modified | Same keys in Russian |
| `src/__tests__/services/notification-service.test.js` | New | Debounce, opt-out, self-suppression, API failure, `_formatName` |
| `src/__tests__/commands/participation-handlers.test.js` | Modified | Add `mockNotificationService`; add notification scheduling tests |
| `src/__tests__/wizard/ride-wizard.test.js` | Modified | Add notify step tests (notifyYes/No, back navigation, defaults, prefill) |
| `src/__tests__/wizard/wizard-field-config.test.js` | Modified | Add `BOOLEAN` type, `notify` field, navigation, `buildRideDataFromWizard` tests |
| `src/__tests__/utils/field-processor.test.js` | Modified | Add `notify` param parsing tests |
| `src/__tests__/wizard/ride-wizard-edge-cases.test.js` | Modified | Fix back-from-confirm test: now expects `notify` step, not `info` |
