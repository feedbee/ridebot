# Strava Event Import Specification (`/fromstrava`)

## Overview

The `/fromstrava` command lets users create or update a ride by pasting a **Strava club group event URL**. The bot fetches the event via the Strava API, maps its fields to a ride, and either creates a new ride or updates an existing one (if the same user previously imported the same event).

Available only in private chat with the bot. Requires Strava API credentials: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`.

---

## Command Syntax

```
/fromstrava <strava-event-url>
```

**URL format:**
```
https://www.strava.com/clubs/{clubId}/group_events/{eventId}
```

Both `www.strava.com` and `strava.com` variants are accepted.

---

## Command Flow

```
/fromstrava <url>
  → parse URL (extract clubId, eventId)
  → if URL invalid → reply invalidUrl error, stop

  → fetch event: GET /api/v3/group_events/{eventId}  (Bearer token)
  → if fetch fails → reply fetchError, stop

  → if event has route reference → fetch full route: GET /api/v3/routes/{routeId}
  → map event fields → rideData

  → getRideByStravaId(eventId, userId)
  → if found → updateRide(existing.id, rideData) → refresh all messages → reply "updated"
  → if not found → createRide(rideData) → post new message in current chat → reply "created"
```

---

## Field Mapping: Strava Event → Ride

| Strava API field | Ride field | Notes |
|---|---|---|
| `title` | `title` | Direct |
| `start_datetime` | `date` | Parsed as `Date` |
| `address` | `meetingPoint` | Direct |
| `type` / `activity_type` | `category` | See category mapping below |
| `club.name` | `organizer` | From nested club object |
| `route.distance` (metres) | `distance` | Divided by 1000, rounded to km |
| `route.estimated_moving_time` (seconds) | `duration` | Divided by 60, rounded to minutes |
| `route.id_str` (or `route.id`) | `routeLink` | `https://www.strava.com/routes/{id_str}` |
| First known-provider URL in `description` | `routeLink` | Fallback when no route attached |
| Pace groups min/max (speed-type only) | `speedMin`, `speedMax` | See speed extraction below |
| Event URL + `description` + pace groups | `additionalInfo` | Concatenated with newlines |
| `eventId` (string from URL) | `metadata.stravaId` | Stored as string to avoid JS float precision loss |
| `ctx.from.id` | `createdBy` | Telegram user ID of the importing user |

---

## Category Mapping

| Strava `type` / `activity_type` | Ride `category` |
|---|---|
| `GravelRide` | `gravel` |
| `MountainBikeRide` | `mtb` |
| `VirtualRide` | `virtual` |
| `EBikeRide` | `e-bike` |
| `Ride` | `road` |
| anything else / missing | `mixed` |

---

## Route Enrichment

The Strava Group Events API returns the `route` field as a **summary object** containing only the route ID — without `distance` or `estimated_moving_time`. To obtain those fields, a second API call is made:

```
GET /api/v3/routes/{routeId}   Authorization: Bearer {token}
```

The response replaces the summary object in the event before field mapping. The same OAuth token obtained for the event fetch is reused.

This secondary request is **best-effort**: if it fails (network error, non-200 response), the import continues without distance/duration. No error is shown to the user.

**Route fallback** (when no `route` field in the event at all):

The event `description` is scanned for URLs from known providers:
- `strava.com/routes/{id}`
- `strava.com/activities/{id}`
- `ridewithgps.com/routes/{id}` or `/trips/{id}`
- `komoot.com/tour/{id}` or `komoot.de/collection/{id}`
- `connect.garmin.com/modern/course/{id}` or `/activity/{id}`

The **first** matching URL becomes `routeLink`. Distance and duration are not populated in fallback mode.

---

## Speed Extraction from Pace Groups

Pace groups from the event response (`event.pace_groups` or `event.upcoming_occurrences[0].pace_groups`) are processed only when `pace_type === 'speed'` (km/h units). Pace-based groups (min/km) are excluded from the speed range calculation.

For speed-type groups, each group has:
- `pace` (or `target_pace_metric`) — center speed in km/h
- `range` (or `pace_range_metric`) — half-width of the speed interval

The extracted range:
- `speedMin` = `min(center − range)` across all groups, rounded
- `speedMax` = `max(center + range)` across all groups, rounded

---

## `additionalInfo` Format

```
<strava-event-url>
<event description>
Pace groups: 20-22 km/h • 23-25 km/h • 26-28 km/h
```

- The event URL is always present as the first line.
- The description line is omitted if the event has no description.
- The pace groups line is omitted if there are no pace groups.
- Sections are joined with `\n`.

For pace-based groups (min/km), the format is `M:SS-M:SS min/km` per group instead of km/h.

---

## Create vs Update Logic

Identity is determined by `(metadata.stravaId, createdBy)` — the Strava event ID and the Telegram user ID of the importer.

| Condition | Result |
|---|---|
| No existing ride with this `(stravaId, userId)` | New ride created; posted in the current private chat |
| Existing ride found | All fields updated; all posted messages refreshed across chats |
| Same event URL, different Telegram user | Always creates a new ride (independent import) |

The `stravaId` is stored as a **string** extracted from the URL (not from the API response `event.id`), because the Strava event IDs exceed JavaScript's safe integer range and would lose precision if parsed as `Number`.

---

## Error Cases

| Situation | Bot response |
|---|---|
| URL missing or not a Strava group event URL | `commands.fromStrava.invalidUrl` |
| Strava API returns non-2xx status | `commands.fromStrava.fetchError` |
| Network error during event fetch | `commands.fromStrava.fetchError` |
| Route fetch fails (secondary request) | Silently ignored; import continues without distance/duration |

---

## Implementation Notes

### `StravaEventParser` (`src/utils/strava-event-parser.js`)

Pure static class. All methods are stateless and synchronous except `fetchEvent`.

| Method | Description |
|---|---|
| `parseEventUrl(url)` | Regex-matches the URL, returns `{ clubId, eventId }` or `null` |
| `fetchEvent(eventId)` | Fetches the event, then fetches full route if `event.route` exists |
| `mapToRideData(event, createdBy, eventUrl, eventId)` | Maps API response to ride fields object |
| `mapActivityTypeToCategory(type)` | Strava activity type → bot category code |
| `extractRouteFromDescription(text)` | Scans text for first known-provider route URL |
| `buildPaceGroupsText(paceGroups, paceType)` | Human-readable pace groups label string |
| `extractSpeedRange(paceGroups, paceType)` | `{ speedMin, speedMax }` for speed-type groups only |
| `buildAdditionalInfo(event, eventUrl)` | Combines URL + description + pace groups text |

The `eventId` parameter in `mapToRideData` is the **string from the URL** (4th argument), not `event.id`. This is intentional — passing `event.id` as a number would silently corrupt 18-digit event IDs.

### `FromStravaCommandHandler` (`src/commands/FromStravaCommandHandler.js`)

Extends `BaseCommandHandler`. Constructor signature:

```js
constructor(rideService, messageFormatter, rideMessagesService, storage, parser = StravaEventParser)
```

`parser` defaults to the real `StravaEventParser` but is injectable for unit testing (avoids ESM module mocking limitations in Jest).

The handler calls `storage.getRideByStravaId()` directly (bypasses `RideService`) because the lookup is identity-based (metadata), not a business operation.

### Storage Changes

**`metadata` field** added to both storage backends:
- MongoDB: `mongoose.Schema.Types.Mixed`, default `{}`; no migration required (optional field, backward-compatible)
- Memory: passed through in create/update/get as-is

**New storage method** `getRideByStravaId(stravaId, createdBy)`:
- MongoDB: `Ride.findOne({ 'metadata.stravaId': stravaId, createdBy })`
- Memory: linear scan over `rides` Map

### Authentication

Reuses the existing `getStravaAccessToken(clientId, clientSecret)` from `src/utils/strava-token-store.js`. The token is fetched once per `/fromstrava` invocation and shared between the event fetch and the optional route fetch.
