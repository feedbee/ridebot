# PoC Specification: Telegram Rich Messages

## Status

Phase 2 settings PoC implemented on 2026-08-29. Rich Messages remain subject to client testing before adoption in ride announcements or other bot messages.

## Context

Telegram introduced Rich Messages in Bot API 10.1 on June 11, 2026. Follow-up releases completed the outgoing authoring API in Bot API 10.2 on July 14, 2026 and added embedded buttons and additional block options in Bot API 10.3 on August 24, 2026.

Rich Messages are a separate message type rather than an extension of the existing `parse_mode: HTML` option. Bots send them with `sendRichMessage` and provide exactly one representation in `rich_message`:

- `html` for Rich HTML;
- `markdown` for Rich Markdown;
- `blocks` for explicit structured blocks.

Telegram does not document a BotFather switch, Premium requirement, payment, AI-bot classification, or approval process for using Rich Messages. They are available to ordinary bots through the Bot API. Normal chat and media permissions still apply. Some individual features, such as certain custom emoji, have their own eligibility rules.

Telegram describes Rich Messages as supported by compatible Telegram clients. The PoC must therefore verify actual rendering in current iOS, Android, and Desktop clients before production adoption.

Official references:

- [Bot API changelog](https://core.telegram.org/bots/api-changelog)
- [Messages and Formatting](https://core.telegram.org/bots/features#advanced-formatting-options)
- [Rich Message Formatting Options](https://core.telegram.org/bots/api#rich-message-formatting-options)
- [`sendRichMessage`](https://core.telegram.org/bots/api#sendrichmessage)
- [`InputRichMessage`](https://core.telegram.org/bots/api#inputrichmessage)

## Product Motivation

The current user and ride settings screens render settings as prose with bold values. Once labels and explanatory text become long, the relationship between a setting and its current value is difficult to scan. This is especially visible in the user settings screen, where ride defaults and notification preferences visually run together.

A two-column key-value table is a focused first use case for Rich Messages:

| Setting | Current value |
| --- | --- |
| Notify about participation changes | Yes |
| Allow other users to repost | No |
| Participation notifications | All participation status changes |

The table is intended to improve information hierarchy only. Existing toggle behavior, callback data, persistence semantics, and setting descriptions must remain unchanged during the PoC.

## Relevant Rich Message Capabilities

The format supports:

- headings, paragraphs, dividers, ordered and unordered lists, and task lists;
- nested bold, italic, underline, strikethrough, spoiler, code, marked, subscript, and superscript text;
- tables with captions, alignment, borders, striped rows, compact layout, and row or column spans;
- quotations, pull quotes, collapsible quotations, and expandable `details` blocks;
- anchors, internal links, references, and footnotes;
- inline and block LaTeX expressions;
- date-time entities rendered in the user's locale;
- photos, videos, audio, voice notes, documents, maps, collages, and slideshows;
- embedded callback and navigation buttons, including `primary`, `success`, `danger`, and `link` styles;
- the existing `reply_markup` mechanism, including inline keyboards.

Rich Message limits are substantially larger than regular message limits:

- 32,768 UTF-8 text characters;
- 500 blocks;
- 16 levels of nesting;
- 50 media attachments;
- 20 table columns.

The settings PoC requires only headings, paragraphs, compact two-column tables, and the existing inline keyboard.

## Goals

- Verify that the project can send and edit Rich Messages through its Telegram library and transport boundary.
- Improve the readability of user and ride settings with key-value tables.
- Preserve all existing settings behavior while changing only presentation.
- Establish safe formatting, localization, testing, and client-compatibility patterns before applying Rich Messages to ride announcements.
- Gather enough evidence to decide whether Rich Messages should be adopted elsewhere in the bot.

## Non-Goals For The Initial PoC

- Do not convert ride announcements in the first implementation slice.
- Do not convert wizard prompts, confirmations, errors, help, or notification messages.
- Do not redesign settings behavior or persistence.
- Do not replace existing inline keyboards with embedded rich buttons initially.
- Do not add maps, media, formulas, streaming drafts, or ephemeral messages.
- Do not add a parallel regular-HTML fallback for settings Rich Messages.

## Delivery Plan

### Phase 1: Update Dependencies

Update all project dependencies before implementing the PoC. This is a prerequisite because the installed Telegram framework version may predate typed Bot API 10.3 support.

Work in this phase must include:

1. Record the current dependency and runtime baseline.
2. Review release notes and migration guidance for direct dependencies, especially `grammy` and `@grammyjs/conversations`.
3. Update dependencies and the lockfile deliberately, including major versions where compatible changes can be completed safely.
4. Adapt the application to documented breaking changes without mixing in Rich Message behavior.
5. Run the standard basic test suite through `./run-tests.sh --mode basic`.
6. Run relevant startup or smoke checks in the devcontainer when available.
7. Confirm whether grammY exposes typed `sendRichMessage` and rich-message editing APIs. If not, document the minimal raw Bot API integration needed for the PoC.

Dependency updates should be delivered and verified as an independent change so regressions are not confused with Rich Message rendering issues.

### Phase 2: Settings Table PoC

Convert only the user settings and ride settings presentation to Rich Messages.

#### User settings

Render the existing sections with a heading and compact key-value tables. The initial structure should remain conceptually equivalent to:

1. Default settings for new rides
   - participation-change notification default;
   - repost permission default.
2. Notification preferences
   - participation notification level.

Explanatory copy should remain outside the table as concise paragraph or footer text. Values should be visually distinct from labels without relying only on bold markup.

#### Ride settings

Render the ride title and identifier, followed by a compact key-value table containing the existing ride-scoped settings. Preserve the distinction between user defaults for future rides and the explicit snapshot stored on an existing ride.

#### Interaction requirements

- Preserve existing callback data and callback handlers.
- Preserve in-place updates after a toggle; the message must remain a Rich Message after editing.
- Keep the existing inline keyboard during the first PoC.
- Preserve English and Russian localization.
- Continue escaping all user-originated values, including ride titles.
- Do not change settings storage, defaults, or notification rules.
- Use the official `sendRichMessage` and rich `editMessageText` paths directly. An unsupported client may render Rich Messages imperfectly, but client rendering does not cause the Bot API request to be rejected.
- Treat Bot API errors normally instead of retrying the same settings response through a second regular-HTML representation. Invalid markup, permissions, rate limits, and invalid parameters require their specific fixes and are not reliably solved by changing message type.
- Keep setting values as text inside table cells. Embedded rich buttons were tested and rejected because long labels do not wrap acceptably in Telegram for iOS. The existing inline keyboard remains the cross-client interaction mechanism.

#### Suggested table behavior

- Use two columns: localized setting label and localized current value.
- Prefer compact mode.
- Avoid wide prose inside cells; move explanations below the table.
- Test wrapping with the longest Russian labels and values.
- Verify light and dark themes and small mobile screens.
- Do not encode meaning through color alone.

### Phase 3: Ride Announcement Experiment

After the settings PoC is accepted, prototype Rich Messages for ride announcements.

Potential uses include:

- a real heading for the ride title;
- structured sections for time, route, organizer, pace, and participation;
- native date-time entities rendered in each user's locale;
- lists for participants;
- expandable additional information;
- an optional map or other route presentation;
- the larger 32,768-character limit for long participant lists;
- later evaluation of embedded styled buttons.

Before converting announcements, update reply-based ride lookup. The current implementation reads `reply_to_message.text`, while a Rich Message is represented through `message.rich_message`. Commands invoked as replies to announcements must continue to resolve the ride reliably.

Announcement creation, synchronized edits across chats and topics, deletion, reposting, and participant-button callbacks must all be covered before this phase can be accepted.

### Phase 4: Evaluate Remaining Messages

Only after settings and announcements have been tested should other bot-authored messages be considered. Evaluate each message category independently:

- help and onboarding;
- wizard previews;
- participant and owner notifications;
- confirmations and errors;
- longer AI-generated responses, if applicable.

Regular messages should remain the default for short confirmations, errors, and simple conversational flows unless Rich Messages provide a clear usability benefit.

## Architecture Direction

The settings PoC may keep its small, settings-specific Rich HTML builders and grammY send/edit calls in `RideSettingsCommandHandler`. A separate formatter or Telegram transport abstraction is not required while there is only one Rich Message settings presentation and no fallback representation to coordinate.

The existing layer boundaries still apply:

- the command handler owns Telegram callbacks and settings-message presentation;
- services must not depend on grammY context objects or Rich Message wire-format details;
- reusable formatting or transport abstractions should be extracted later only when another Rich Message flow demonstrates shared behavior and makes the abstraction concrete.

## Testing And Evaluation

### Automated verification

- User settings send and edit tests using Rich Message payloads.
- Ride settings send and edit tests using Rich Message payloads.
- Callback tests proving toggles still update persistence and presentation.
- Escaping tests for ride titles and any other user-originated content.
- Handler contract tests for `sendRichMessage` and rich `editMessageText` calls.
- Regression tests proving unrelated regular HTML messages remain unchanged.
- Full standard basic test suite.

### Manual client matrix

Verify at minimum:

| Client | Checks |
| --- | --- |
| Telegram for Android | Table layout, wrapping, buttons, edits, light/dark themes |
| Telegram for iOS | Table layout, wrapping, buttons, edits, light/dark themes |
| Telegram Desktop | Table sizing, wrapping, buttons, edits |

Record exact client versions during testing. Test both short English content and the longest expected Russian content.

### PoC success criteria

- Settings are visibly easier to scan than the current prose layout.
- Labels and values remain understandable on narrow mobile screens.
- Sending, editing, and callbacks work reliably.
- Existing settings semantics and persistence are unchanged.
- Current supported Telegram clients render the table acceptably.
- No regressions occur in the standard basic test suite.
- The implementation yields a reusable pattern for the later announcement experiment.

## Known Risks And Open Questions

- Older or third-party Telegram clients may not render Rich Messages consistently.
- Dependency upgrades may introduce unrelated breaking changes and must be isolated from the PoC.
- Long localized labels may cause tables to become taller or less readable than a well-designed list.
- Rich HTML, Rich Markdown, and explicit blocks differ in complexity and escaping behavior. Rich HTML is the leading candidate because the project already has HTML escaping patterns, but the PoC should confirm the best representation.
- The bot currently assumes a regular-message shape in some reply-based flows; announcement migration requires an audit of all such assumptions.
- Rich Message delivery requires an up-to-date official Bot API endpoint (or an equivalently current self-hosted Bot API server).
- The minimum Telegram client versions considered supported by the project are not yet defined.

## Decision Gate

At the end of Phase 2, review screenshots and behavior across the client matrix. Continue to the announcement experiment only if tables provide a clear readability improvement and the integration does not require disproportionate compatibility or maintenance work.
