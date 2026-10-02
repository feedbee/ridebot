# Ride Chat Link Specification

## Status

Implemented.

## Objective

Add an optional `chat` field to a ride. The field contains a Telegram chat or invite link used for ride coordination and is shown in ride announcements and previews.

The field is informational only. It does not attach a Telegram group to the ride, enable moderation, synchronize participants, or change the behavior of `/attach`, `/detach`, or `/joinchat`.

## Product decisions

- The persisted and parameter name is `chat`.
- The field is optional and limited to 512 characters after trimming.
- Only links that identify a Telegram chat or invite are accepted.
- The announcement renders a short localized link instead of the raw URL:
  - English: `💬 Chat: Open chat`
  - Russian: `💬 Чат: Открыть чат`
- The link is rendered immediately above `Additional info` / `Дополнительно` and in the same relative position in wizard and AI previews.
- Chat title discovery is not part of this change. Resolving arbitrary Telegram links would be unreliable, and invite links do not expose a title without joining or additional access.
- `/attach` and `/detach` never read, populate, replace, or clear `ride.chat`.
- The existing attached-group notice and `/joinchat` flow remain unchanged. An announcement may show both the informational chat link and the attached-group notice.

## Accepted input

### Supported forms

The validator accepts Telegram chat links in these families:

- public chat links, such as `https://t.me/example_chat`
- current invite links, such as `https://t.me/+inviteHash`
- legacy invite links, such as `https://t.me/joinchat/inviteHash`
- equivalent `http://`, `t.me/...`, `telegram.me/...`, and `telegram.dog/...` web forms
- Telegram deep links that resolve a chat or open an invite, such as `tg://resolve?domain=example_chat` and `tg://join?invite=inviteHash`

Surrounding whitespace is removed. Scheme-less supported web links are normalized to HTTPS. `http` links are upgraded to HTTPS, and supported Telegram host aliases are normalized to `t.me`. Deep links retain the `tg://` scheme in a normalized, safe form.

### Rejected forms

- non-Telegram hosts and schemes
- bare usernames such as `@example_chat`
- malformed or empty links
- values longer than 512 characters after trimming
- Telegram links that clearly address a message, comment, story, topic, bot start action, or other non-chat resource rather than the chat itself

Validation is syntactic and does not make a network request. The bot does not guarantee that the target exists, remains accessible, or is actually used for this ride.

### Clearing

- In `/updateride` and parameter-based `/dupride`, `chat: -` clears the field.
- In update and duplicate wizards, the existing clear action clears the field.
- In `/airide` update mode, an explicit request to remove the coordination chat is represented as `chat: "-"` and clears it.
- An omitted field preserves the existing value during update and copies the original value during duplication.

## Data contract and persistence

The ride interface gains:

```js
/** @property {string} [chat] - Normalized Telegram coordination chat or invite link */
```

MongoDB's ride schema gains an optional string field:

```js
chat: String
```

Memory storage passes the field through like other simple ride properties. Existing rides remain valid with `chat` absent; no backfill or schema-version migration is required.

The feature does not add a user setting or default. A ride's chat link is ride content, not configuration.

## Creation and editing flows

### Text parameters

`chat` becomes a valid parameter for:

- `/newride`
- `/updateride`
- `/dupride`

Example:

```text
/newride
title: Sunday gravel
when: Sunday 09:00
chat: https://t.me/+exampleInvite
```

The shared field processor validates and normalizes the value at the application boundary. Invalid input prevents persistence and returns a localized validation error.

### Wizard

Create, update, and duplicate wizards gain an optional, clearable `chat` step between `meet` and `info`:

```text
meet -> chat -> info -> confirm
```

The prompt explains that the value must be a Telegram chat or invite link. The field is included in live preview and in the final object produced by `buildRideDataFromWizard()`.

Update wizard prefill uses the current ride's value. Duplicate wizard prefill copies the original ride's value. The user may replace, clear, or skip it using the existing wizard conventions.

### AI ride flow

`/airide` recognizes a coordination chat link as the `chat` field in both create and update modes. The AI extraction contract gains:

```json
{
  "chat": "https://t.me/example_chat"
}
```

The AI prompt must distinguish a coordination chat link from route links and from arbitrary URLs in additional information. AI output is not trusted: it passes through the same deterministic validation and normalization used by text parameters before persistence.

The AI preview includes the effective chat value. In update mode it falls back to the existing value when the user did not mention `chat`, and omits it when the user explicitly clears it.

### Strava import

`/fromstrava` does not derive or populate `chat`. Rides created from Strava simply have no chat field unless edited afterward.

### Duplication semantics

Both parameter-based and wizard duplication copy `chat` from the original ride by default, regardless of who owns the original ride. An explicit override replaces it; an explicit clear removes it from the duplicate.

## Announcement and preview rendering

When `ride.chat` is present, the formatter emits an HTML anchor using the normalized link and localized short text:

```html
💬 Chat: <a href="https://t.me/example_chat">Open chat</a>
```

The label, anchor text, and escaped `href` are localized or safely encoded as appropriate. The raw invite URL is not displayed, so long links do not affect layout. When the field is absent, no line or extra spacing is emitted.

The same presentation rule applies to:

- regular ride announcements
- synchronized announcement updates
- wizard live previews
- AI ride previews

The attached-group notice remains based solely on `ride.groupId` and is rendered independently in its existing location.

## Help and localization

English and Russian locale trees gain matching keys for:

- parameter description
- wizard prompt
- invalid-link and too-long validation feedback
- formatter label
- formatter anchor text

Command help and examples list `chat` as an optional Telegram coordination chat or invite link. `/attach`, `/detach`, and `/joinchat` help text is unchanged.

## Layer responsibilities

- `RideParamsHelper` recognizes the `chat` parameter.
- A focused utility owns Telegram chat-link validation and normalization so wizard, parameter, and AI flows use one contract.
- `FieldProcessor` maps valid input to `ride.chat` and implements parameter clear semantics.
- Wizard configuration owns prompting and delegates validation to the shared utility.
- `RideService` preserves the field across create, update, and duplicate use cases.
- `MessageFormatter` owns the localized, HTML-safe presentation.
- Storage adapters persist the value without embedding business rules.
- Group command handlers remain unchanged with respect to `ride.chat`.

## Testing strategy

### Unit tests

- accept each supported public, invite, host-alias, scheme-less, and deep-link family
- trim and normalize accepted web links
- reject non-Telegram, malformed, oversized, and clearly non-chat Telegram links
- process create, update, clear, and omitted `chat` values in `FieldProcessor`
- parse `chat` as a recognized text command parameter
- render the short safe anchor above additional information, without exposing the raw URL as visible text
- omit the line and spacing when `chat` is absent

### Wizard tests

- include the new step in create, update, and duplicate navigation
- validate, store, preview, prefill, replace, and clear the value
- include `chat` in the built ride data

### Service and command tests

- create, update, and duplicate through text parameters
- copy by default and override or clear during duplication
- accept valid AI extraction and reject invalid AI-produced links before persistence
- preserve an existing value in AI update when `chat` is omitted and clear it only when explicitly requested
- verify `/attach` and `/detach` leave `chat` unchanged

### Scenario coverage

- create a ride with `chat` and verify persisted data plus the visible announcement link
- update the chat link and verify all tracked announcements refresh
- run attach and detach for a ride with `chat` and verify the informational link remains while the attached-group notice changes independently

### Storage tests

- round-trip `chat` through memory and MongoDB storage
- keep legacy ride documents without `chat` readable

## Commands and project boundaries

- Standard verification: `./run-tests.sh --mode basic`
- Commands should be executed through `./scripts/devcontainer-exec.sh` when a matching devcontainer is running, as required by the repository instructions.
- No dependency, external network lookup, user default, or group-management behavior is introduced.
- Existing historical specifications under `docs/changes/` are not edited.

## Acceptance criteria

1. A creator can set a valid Telegram coordination chat link through `/newride`, `/updateride`, `/dupride`, their wizard variants, and `/airide`.
2. Invalid, non-chat, or oversized values are rejected consistently before persistence.
3. Stored web links use the canonical HTTPS `t.me` form where normalization is possible.
4. Announcements and previews show `💬 Chat: Open chat` / `💬 Чат: Открыть чат` immediately above additional information.
5. Long invite links never appear as visible announcement text.
6. Updating the field refreshes all tracked ride announcements.
7. Duplication copies the field unless explicitly overridden or cleared.
8. `/fromstrava` leaves the field absent.
9. `/attach` and `/detach` never mutate the field, and the existing attached-group notice remains independent.
10. Existing rides without the field continue to work without migration or backfill.
11. English and Russian localization trees remain structurally consistent.
12. The basic test suite passes.

## Assumptions requiring approval

1. The public field and command parameter are both named `chat`, rather than `chatLink`.
2. The short localized anchor (`Open chat` / `Открыть чат`) is preferable to displaying or truncating the raw URL.
3. `@username` is not accepted because the requested value is specifically a link.
4. Chat title lookup is excluded from this version.
5. Duplicate rides inherit the link even when a different user duplicates the ride.
6. Telegram deep links are supported alongside web links.
