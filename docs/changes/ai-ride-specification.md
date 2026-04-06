# AI Ride Creation/Update Specification

## Overview

A new `/airide` command lets users create or update rides using free-form natural language. The bot sends the input to Claude Haiku, extracts structured ride fields, shows a formatted preview, and saves the ride on confirmation.

---

## Commands

### Create a new ride
```
/airide <free-form description>
```
Example:
```
/airide Road ride this Saturday 9am, 70km, 25-28 km/h, starting from Central Park
```

### Update an existing ride
```
/airide #<rideId> <what to change>
```
Example:
```
/airide #abc123 change the date to next Sunday and increase distance to 80km
```

The `#` prefix is required to distinguish a ride ID from the start of a description. Only the ride creator can update.

---

## Behavior

### Step 1 — Parsing

After the command is sent, the bot replies with a temporary "Parsing..." message while calling the Claude Haiku API.

The AI extracts any ride fields it can identify:
- `title` — ride name
- `when` — date and time (interpreted relative to today)
- `category` — road, gravel, mtb, mtb-xc, e-bike, virtual, mixed
- `organizer` — organizer name
- `meet` — meeting point
- `route` — route URL (Strava, Komoot, RideWithGPS, Garmin)
- `dist` — distance in km
- `duration` — duration (e.g. "2h 30m")
- `speed` — speed range/min/max/avg (e.g. "25-28", "25+", "~25")
- `info` — additional notes

The "Parsing..." message is deleted after the API call completes.

### Step 2 — Missing required fields

If `title` or `when` cannot be extracted, the bot asks a follow-up question:

> ❓ What should I call this ride?

or

> ❓ When is the ride? (e.g. "tomorrow at 6pm", "Saturday 10am")

The user's reply is combined with the original text and re-sent to the AI. This repeats up to **2 times**. After 2 failed attempts, the session ends with an error message.

### Step 3 — Preview and confirmation

Once all required fields are extracted, the bot sends a formatted ride preview using the same layout as the public ride announcement (but without participation buttons):

```
🚲 Evening Road Ride

📅 When: Sat, 21 Jun at 09:00
🚵 Category: Road Ride

📍 Meeting point: Central Park entrance

📏 Distance: 70 km
⚡ Avg speed: 25–28 km/h

ℹ️ Additional info: Bring lights

📋 Please review the ride details above and confirm.
```

Below the preview, two buttons are shown:

| Button | Action |
|--------|--------|
| ✅ Confirm | Save the ride |
| ❌ Cancel | Discard and delete preview |

### Step 4 — Saving

**On Confirm:**
- Create mode: ride is created and posted to chats (same as `/newride`)
- Update mode: ride is updated and all existing ride messages are refreshed
- Preview message is deleted

**On Cancel:**
- Session cleared
- Preview message deleted
- Bot replies: "Ride creation cancelled."

---

## Update Mode Details

- The AI is instructed to extract only the fields the user explicitly mentions
- Fields not mentioned are left unchanged on the existing ride
- Passing `"-"` for a field clears it (consistent with `/updateride` parameter behavior)
- The preview shows the merged result (existing ride + AI-extracted changes)

---

## Error Cases

| Situation | Bot response |
|-----------|-------------|
| No text after `/airide` | Usage hint message |
| Active session already open | "You already have an active AI ride session..." |
| AI API unavailable | "❌ Could not parse ride details. Please try again." |
| AI returns unparseable response | Same as above |
| Ride ID not found (update mode) | Standard "Ride not found" error |
| User is not ride creator (update mode) | Standard "Only the creator can update" error |
| Date resolved to the past | Error from field validation, session ends |
| Session expired (bot restarted, callback tapped) | "Session expired. Please use /airide again." |

---

## Implementation Notes

### AI Model
`claude-haiku-4-5-20251001` — fast and cost-effective for structured extraction.

### API Key
New env var: `ANTHROPIC_API_KEY`

### Reused Components
- `FieldProcessor.processRideFields()` — field normalization (called internally by RideService)
- `parseDateTimeInput()` — parse `when` for preview date display
- `normalizeCategory()` — normalize category string
- `MessageFormatter.formatRidePreview()` — preview rendering
- `RideService.createRideFromParams()` / `updateRideFromParams()` — final save
- `RideMessagesService.createRideMessage()` — post to chats
- `BaseCommandHandler.updateRideMessage()` — refresh existing messages

### Session State
In-memory Map keyed by `userId:chatId` (same pattern as wizard). Sessions are lost on bot restart; tapping stale buttons returns a "session expired" toast.

### Text Handler Coexistence
The AI follow-up text handler is chained after the wizard text handler. Each handler guards on its own state map and ignores messages it doesn't own.
