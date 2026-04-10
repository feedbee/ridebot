# Multiple Route Links Specification

## Overview

Rides currently support a single `routeLink` string. This change introduces support for multiple route links per ride using a new `routes` field:

```js
routes: [{ url, label }]
```

This feature is intended to support:
- the same route published on multiple services
- alternative route variants for the same ride
- manual labels such as `Long route`, `Short route`, `Komoot`, or `Coffee stop variant`

The first item in `routes` is the primary route by convention. No explicit `isPrimary` field is added.

The implementation must preserve backward compatibility with existing rides that still store a single `routeLink`.

---

## Goals

- Allow a ride to store multiple route links in a stable ordered list.
- Support optional custom labels per route.
- Preserve existing UX for single-route rides.
- Keep the parameter mode and wizard simple: no add/remove subcommands, no nested route editor, no route-specific management commands.
- Extend AI ride parsing and Strava import to support multiple routes.

---

## Non-Goals

- No `provider`, `kind`, or `isPrimary` fields in storage.
- No route-level add/remove commands now or later.
- No URL normalization or canonical deduplication in this change.
- No arbitrary external links from Strava descriptions; only known route providers are imported.

---

## Data Model

### New Shape

Ride objects should support:

```js
routes: [
  { url: 'https://www.strava.com/routes/123', label: 'Strava' },
  { url: 'https://www.komoot.com/tour/456', label: 'Backup option' }
]
```

Rules:
- `url` is required.
- `label` is optional in storage.
- Route order is preserved.
- The first route is the effective primary route.

### Backward Compatibility

Soft compatibility is required.

When reading a ride:
- if `routes` is present (including an empty array), use it as the source of truth
- otherwise, if legacy `routeLink` exists, expose a derived single-item `routes` array from it

Semantics:
- `routes: []` explicitly means the ride has no routes
- legacy fallback applies only when `routes` is missing (`undefined` / `null`), not when it is empty

When writing new or updated rides:
- write `routes`
- legacy `routeLink` may still be read for compatibility, but the new implementation should treat `routes` as the source of truth

No data migration is required for this change.

---

## Label Resolution

### Stored Labels

If a route item has a stored `label`, render it as-is.

### Derived Labels

If `label` is missing, derive it from the URL at render time:
- `Strava`
- `Garmin`
- `Komoot`
- `RideWithGPS`

If the URL does not match a known provider, use the localized fallback label already used by the formatter:
- English: `Link`
- Russian: `Ссылка`

Known provider labels must use the exact case above.

Derived labels are not persisted unless the route was explicitly created with that label.

---

## Message Rendering

### Ride Message

The ride announcement continues to show one route section.

Format:
- one header line: `🗺️ Route:`
- one content line with route links rendered by label and separated by commas

Example:

```text
🗺️ Route: Strava, Komoot, Short variant
```

Each label is an HTML anchor to the corresponding URL.

### Preview Message

Wizard preview and AI preview use the same rendering rule as the final ride message.

### Single-Route Behaviour

A ride with one route should still display as a normal single route line. The visual structure remains the same; only the internal representation changes.

---

## Parameter Mode

### Syntax

Parameter mode continues to use repeated `key: value` lines.

Multiple routes are passed with repeated `route:` keys:

```text
/newride
title: Saturday ride
when: saturday 10:00
route: https://www.strava.com/routes/123
route: Komoot | https://www.komoot.com/tour/456
route: Short | scenic | https://ridewithgps.com/routes/789
```

Parsing rules:
- `route: <url>` → `{ url, label: undefined }`
- `route: <label> | <url>` → `{ url, label }`
- the URL is always parsed from the last segment after splitting by `|`
- everything before the last `|` belongs to the label and is rejoined with `|`
- leading and trailing whitespace is trimmed from both label and URL

This allows `|` to be used inside labels.

### Update Semantics

For `/updateride`:
- if at least one `route:` line is present, it replaces the entire route list
- `route: -` clears all routes

For `/dupride`:
- existing `routes` are copied by default
- if at least one `route:` line is present, it replaces the entire copied route list
- `route: -` clears all routes in the duplicated ride

### Unknown Providers

Any valid URL is allowed in manual parameter mode. Provider detection only affects derived labels, not acceptance.

---

## Wizard Behaviour

### Input Format

The route step accepts one route per line.

Examples:

```text
https://www.strava.com/routes/123
Komoot | https://www.komoot.com/tour/456
Short variant | https://ridewithgps.com/routes/789
```

Rules:
- one non-empty line = one route
- a single URL-only line creates a route without a stored label
- a labeled line uses the same `label | url` format as parameter mode
- the URL is parsed from the last `|`-separated segment

### Create / Update Semantics

- empty input on a skippable route step means skip
- multiple lines replace the full route list in the wizard state
- `-` in update mode clears all routes
- mixed labeled and unlabeled entries are allowed

### Route Enrichment

When the wizard receives multiple routes:
- distance and duration auto-fill must continue to come from the first route that produces parseable metrics
- changing the route list in the wizard should refresh stale auto-derived distance and duration from the first route that produces parseable metrics
- if the new route list produces no metrics, existing distance and duration values remain unchanged

---

## AI Ride Mode

### Extraction Schema

AI extraction should move from a single `route` field to a plural `routes` field.

Expected AI output shape:

```json
{
  "title": "Saturday ride",
  "when": "Saturday 10:00",
  "routes": [
    "https://www.strava.com/routes/123",
    "Komoot | https://www.komoot.com/tour/456"
  ]
}
```

Rules:
- `routes` is optional
- each array element uses the same text format as manual parameter mode and wizard input
- in update mode, if `routes` is omitted, existing routes stay unchanged
- in update mode, if `routes` is provided, it replaces the full list
- `"-"` means clear all routes

### Preview Enrichment

When AI provides multiple routes:
- route parsing should attempt known-provider enrichment in order
- distance and duration should be filled from the first route with parseable metrics
- the preview should render all routes, not just the first one

---

## Strava Import

### Attached Route Wins

If the Strava event has an attached route object:
- create exactly one route entry from that attached Strava route
- do not parse additional provider links from the event description
- distance and duration come from the attached route, as today

### Description Fallback

If the Strava event does not have an attached route object:
- scan the event description for URLs
- keep only links from known route providers
- preserve discovery order
- add all matching provider links to `routes`
- do not add unknown-provider links

Distance and duration in fallback mode should continue to be derived from the first found route only.

### Route Sources Included

Known providers:
- Strava
- Garmin
- Komoot
- RideWithGPS

### Additional Info

The existing `additionalInfo` behavior is unchanged unless implementation cleanup requires small internal refactoring.

---

## Route Parsing Rules

### Shared Input Parser

The implementation should use one shared parser for route entry text where possible, so that parameter mode, wizard mode, and AI mode all interpret route input identically.

Recommended parsing contract:

```js
parseRouteEntry('Komoot | https://www.komoot.com/tour/456')
// => { url: 'https://www.komoot.com/tour/456', label: 'Komoot' }

parseRouteEntry('Short | scenic | https://ridewithgps.com/routes/789')
// => { url: 'https://ridewithgps.com/routes/789', label: 'Short | scenic' }
```

Validation:
- URL must be syntactically valid
- label may be empty after trimming; in that case it is omitted
- invalid route entries should produce the same localized validation errors currently used for invalid route URLs

### Metric Extraction

When more than one route is present:
- iterate in order
- try provider parsing per route
- keep the first successful `distance`
- keep the first successful `duration`
- once a value is set explicitly by the user, it must not be overwritten

---

## Documentation Changes

Update user-facing docs to explain:
- rides can now have multiple route links
- route labels are optional
- parameter mode supports repeated `route:` lines
- labeled syntax is `Label | URL`
- the last `|`-separated segment is treated as the URL
- wizard route input accepts one route per line
- AI ride mode can extract multiple routes
- `/fromstrava` imports all known route links from the description only when no attached Strava route exists

Relevant docs likely include:
- `README.md`
- command examples for `/newride`, `/updateride`, `/dupride`, `/airide`, `/fromstrava`

---

## Commands

Development and verification commands for this change:

```bash
./scripts/devcontainer-exec.sh ./run-tests.sh --mode basic
./scripts/devcontainer-exec.sh npx jest src/__tests__/utils/route-parser.test.js
./scripts/devcontainer-exec.sh npx jest src/__tests__/utils/strava-event-parser.test.js
./scripts/devcontainer-exec.sh npx jest src/__tests__/services/ride-service.test.js
./scripts/devcontainer-exec.sh npx jest src/__tests__/formatters/message-formatter.test.js
./scripts/devcontainer-exec.sh npx jest src/__tests__/wizard/ride-wizard.test.js
./scripts/devcontainer-exec.sh npx jest src/__tests__/wizard/ride-wizard-preview.test.js
./scripts/devcontainer-exec.sh npx jest src/__tests__/commands/ai-ride-command-handler.test.js
./scripts/devcontainer-exec.sh npx jest src/__tests__/commands/from-strava-command-handler.test.js
```

Always use the basic test mode by default. Do not use Mongo mode unless explicitly requested.

---

## Project Structure

Expected implementation areas:

- `src/storage/` — storage contracts and Mongo/memory persistence
- `src/services/` — create/update/duplicate route handling
- `src/utils/` — route entry parsing, provider label derivation, route parsing
- `src/formatters/` — ride and preview rendering
- `src/wizard/` — multiline route input and preview state
- `src/commands/` — AI mode, update/duplicate flows, Strava import
- `src/i18n/` — fallback labels and any updated help text
- `src/__tests__/` — unit and integration coverage
- `README.md` and `docs/changes/` — docs and change notes

---

## Boundaries

### Always Do

- Preserve backward compatibility with rides that only have `routeLink`.
- Keep route order stable.
- Use exact provider labels: `Strava`, `Garmin`, `Komoot`, `RideWithGPS`.
- Apply identical route text parsing rules across parameter mode, wizard mode, and AI mode.
- Update tests and docs together with the implementation.

### Ask First

- Any data migration that rewrites existing stored rides
- Any change to user-facing route formatting beyond the agreed single-line comma-separated rendering
- Any attempt to add URL normalization, deduplication, or route management commands

### Never Do

- Do not add `provider`, `kind`, or `isPrimary` to persisted route items.
- Do not import unknown-provider links from Strava descriptions.
- Do not change fallback metric precedence away from first successful route.
- Do not remove legacy `routeLink` read compatibility in this change.

---

## Testing Strategy

Update and extend tests for:

- storage compatibility with legacy `routeLink`
- route list persistence and readback
- formatter rendering with one route and multiple routes
- derived provider labels and localized fallback labels
- parameter parsing with repeated `route:` lines
- route label parsing where `|` appears inside the label
- update replace-all semantics
- clear-all semantics with `route: -`
- duplicate copy/replace semantics
- wizard multiline route entry handling
- AI extraction schema using `routes`
- AI preview rendering with multiple routes
- Strava import with attached route only
- Strava import with all known provider links from description in order
- first-success metric extraction across multiple routes

The default full-project verification command remains:

```bash
./scripts/devcontainer-exec.sh ./run-tests.sh --mode basic
```

---

## Success Criteria

This change is complete when:

1. New rides can store multiple route links in ordered `routes`.
2. Existing rides with only `routeLink` still render correctly without migration.
3. Parameter mode accepts repeated `route:` keys and labeled entries.
4. Wizard route input accepts one route per line and supports labels.
5. AI ride mode can extract and preview multiple routes using `routes`.
6. `/fromstrava` imports either the attached Strava route only, or all known description links when no attached route exists.
7. Distance and duration continue to come from the first successful route parse unless explicitly provided by the user.
8. Ride messages and previews render route labels as one comma-separated linked line.
9. Documentation and tests are updated to match the final behavior.

---

## Suggested Implementation Plan

1. Introduce shared route entry parsing and provider label derivation utilities.
2. Add `routes` support to storage contracts and soft compatibility for legacy `routeLink`.
3. Update message formatting and preview formatting to render route lists.
4. Update parameter parsing, field processing, and ride service create/update/duplicate flows.
5. Update wizard route step for multiline route entry handling.
6. Update AI extraction prompt, parser, preview enrichment, and save path.
7. Update Strava import to emit `routes` with the agreed precedence rules.
8. Refresh documentation and test coverage.
