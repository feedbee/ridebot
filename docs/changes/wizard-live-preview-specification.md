# Wizard Live Preview Specification

## Overview

The wizard now shows a **live ride preview message** that appears above the wizard question from the very first step and updates with each answer, so the user can see how the final ride announcement will look as they fill in the details.

---

## Behavior

### On Wizard Start (`/newride`, `/updateride`, `/duplicateride`)

Two messages are sent in this order:

1. **Preview message** (above) — shows either:
   - A placeholder (`🚲 Ride preview — fill in the details...`) for fresh wizards
   - A partially-filled preview for update/duplicate wizards (prefill data is shown immediately)

2. **Wizard question** (below) — shows the first step prompt (e.g., "📝 Please enter the ride title:")

### During the Wizard

- After each step is answered (text input, button selection, or skip), the **preview message is edited in-place** to reflect the latest data.
- Fields that haven't been filled yet simply don't appear in the preview.
- The preview uses the same formatting as the final public ride announcement (bold title, emoji labels, grouped sections), but **without participation buttons or participant lists**.
- The wizard question message is also edited in-place as before.

### At the Confirm Step

- The **preview message is updated** one final time with the complete ride data (including auto-filled organizer if not explicitly set).
- The **wizard question** shows a simplified prompt: `✅ Review the preview above and confirm:` with Back / Create|Update / Cancel buttons.
- The full confirmation listing that was previously shown in the wizard question is replaced by the live preview, which already shows all the details.

### On Cancel

Both messages are deleted:
1. Preview message
2. Wizard question

A "Ride creation cancelled" reply is sent.

### On Confirm (Create / Update)

Both messages are deleted:
1. Preview message
2. Wizard question

The final ride announcement is then posted (via `RideMessagesService`).

---

## Preview Format

The preview renders the ride fields in the same groups as the public ride announcement:

```
🚲 Evening Ride

📅 When: Wednesday, 21 Jul at 18:00
🚵 Category: Road Ride

👤 Organizer: Jane Doe
📍 Meeting Point: City Park
🗺️ Route: View route

📏 Distance: 45 km
⏱ Duration: 2h 30min
⚡ Avg speed: 25-28 km/h

ℹ️ Additional Info: Bring lights
```

- Fields that are `null` or `undefined` are silently omitted.
- No participation section (no "Joined", "Thinking", "Not interested" lines).
- No inline keyboard on the preview message.
- No `#Ride #id` footer.

---

## Error Handling

- If editing the preview fails with "message is not modified" (e.g., when navigating back without changing data), the error is silently ignored.
- If editing the preview fails for other reasons (e.g., message deleted by user), the bot tries to send a new preview message and updates the stored preview message ID.
- If preview cleanup fails on cancel/confirm, the error is logged but does not block the wizard from completing.

---

## Files Changed

| File | Change |
|---|---|
| `src/i18n/locales/en.js` | Added `wizard.preview.placeholder` and `wizard.confirm.confirmPrompt` |
| `src/i18n/locales/ru.js` | Same keys in Russian |
| `src/formatters/MessageFormatter.js` | Added `formatRidePreview(rideData, language)` method |
| `src/wizard/RideWizard.js` | Preview lifecycle: send, update, delete; simplified confirm step |
| `src/__tests__/wizard/ride-wizard.test.js` | Updated for new 2-message startup |
| `src/__tests__/wizard/ride-wizard-preview.test.js` | New test file for preview feature |
| `src/__tests__/formatters/message-formatter.test.js` | New tests for `formatRidePreview` |
