# AI Ride Creation/Update Specification (`/airide`)

## Overview

The `/airide` command lets users create or update rides through a **natural language dialog**. The bot uses Claude Haiku to parse each message, shows a live preview that updates after every message, and saves the ride when the user confirms.

Available only in private chat with the bot. Requires `ANTHROPIC_API_KEY`.

---

## Command Variants

| Command | Behaviour |
|---------|-----------|
| `/airide` | Start empty create dialog — bot prompts for a description |
| `/airide <text>` | Start create dialog with first message already processed |
| `/airide #rideId` | Start update dialog — bot prompts for what to change |
| `/airide #rideId <text>` | Start update dialog with first message already processed |

The `#` prefix is required to distinguish a ride ID from a description. Only the ride creator can update.

---

## Dialog Flow

```
/airide [#id] [text]
  → validate (existing session check, fetch ride for update, creator check)
  → if text provided → process immediately → show preview with Confirm/Cancel
  → else → send start prompt, wait for messages

Each user message:
  → append to dialog history
  → call Claude Haiku with full history
  → update live preview in-place (edit the same message)
  → Confirm/Cancel buttons always visible

[Confirm] → validate required fields (title + date)
  → if missing → show toast error, dialog stays open
  → else → save ride, delete all dialog bot messages

[Cancel] → delete all dialog bot messages, reply "cancelled"
```

Messages are limited to **10 per session**. After the 10th message the preview shows a limit notice; further messages are ignored.

---

## Live Preview

After each message the bot edits a single persistent preview message (same layout as the public ride announcement, without participation buttons):

```
🚲 Gravel Ride South of the City

📅 When: Sun, 12 Apr 2026 at 09:00
🚵 Category: Gravel

👤 Organizer: Valera
📍 Meeting point: Central Station

📏 Distance: 80 km
⏱ Duration: 3 h 30 min
⚡ Avg speed: 22–25 km/h

[❌ Cancel]  [✅ Confirm]
```

After the 10-message limit is reached:
```
{preview}

⚠️ Message limit reached. Please confirm or cancel.

[❌ Cancel]  [✅ Confirm]
```

---

## Required Fields

`title` and `when` (date/time) are required to confirm. If either is missing when the user taps Confirm, a toast notification lists the missing fields and the dialog stays open so the user can add them in a follow-up message.

In **update mode** the existing ride's values count — e.g. if the ride already has a date, the user doesn't need to mention it.

---

## AI Extraction

**Model:** `claude-haiku-4-5-20251001`

**Mode:** The full list of user messages is sent to the AI on every turn, numbered:
```
[1] gravel ride Sunday 9am, 80km
[2] speed 22-25, meeting at Central Station
[3] organizer Valera
```

The AI returns the **current complete state** of all known fields. Later messages override earlier ones for the same field.

**Extracted fields:**

| Field | Description |
|-------|-------------|
| `title` | Ride name |
| `when` | Date/time in natural language |
| `category` | `road`, `gravel`, `mtb`, `mtb-xc`, `e-bike`, `virtual`, `mixed` |
| `organizer` | Organizer name |
| `meet` | Meeting point |
| `routes` | Array of route strings; each item is either `URL` or `Label | URL` |
| `dist` | Distance in km |
| `duration` | Duration (e.g. `"2h 30m"`, `"90m"`) |
| `speed` | Speed range/min/max/avg (e.g. `"25-28"`, `"25+"`, `"~25"`) |
| `info` | Additional notes |

Route extraction notes:
- AI may return multiple route links
- each route item uses the same text format as parameter mode
- when route labels are omitted, labels are derived at render time
- route metrics are enriched from the first route that provides parseable distance or duration

---

## Saving

**On Confirm:**
- **Create mode:** ride is created and posted to chats (same as `/newride`)
- **Update mode:** only the fields mentioned by the user are changed; unmentioned fields stay as-is. Passing `"-"` for a field clears it (consistent with `/updateride` behavior). All existing ride messages are refreshed.
- All bot dialog messages are deleted after saving.

**On Cancel:**
- All bot dialog messages deleted
- Bot replies: "Ride creation cancelled."

---

## Error Cases

| Situation | Bot response |
|-----------|-------------|
| Active session already open | "You already have an active AI ride session…" |
| AI API unavailable / unparseable response | "❌ Could not parse ride details." — session cleared |
| Ride ID not found (update mode) | Standard "Ride not found" error |
| User is not ride creator (update mode) | Standard "Only the creator can update" error |
| Date resolved to the past | Error from field validation after Confirm, session cleared |
| Session expired (bot restarted, stale callback) | "Session expired. Please use /airide again." toast |
| Required fields missing at Confirm | Toast with missing field names, dialog stays open |

---

## Implementation Notes

### Session State
In-memory Map keyed by `userId:chatId` (same pattern as the wizard). Sessions are lost on bot restart; tapping stale buttons returns a "session expired" toast.

### Message Cleanup
Only bot-sent messages are deleted (start prompt + preview). Bots cannot delete user messages in private chats.

### Preview Update
Uses `ctx.api.editMessageText()` to edit the preview in-place — same pattern as `RideWizard.updatePreviewMessage()`. Falls back to sending a new message if the edit fails.

### Reused Components
- `parseDateTimeInput()` — parse `when` for preview date display
- `parseDuration()` — convert duration string to minutes for preview
- `parseSpeedInput()` — parse speed string into `speedMin`/`speedMax` for preview
- `parseRouteEntries()` — parse `routes[]` items from AI output
- `normalizeCategory()` — normalize category string
- `MessageFormatter.formatRidePreview()` — preview rendering
- `RideService.createRideFromParams()` / `updateRideFromParams()` — final save
- `RideMessagesService.createRideMessage()` — post to chats
- `BaseCommandHandler.updateRideMessage()` — refresh existing messages
