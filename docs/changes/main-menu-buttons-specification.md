# Main Menu Buttons Specification

## Status

Implemented on 2026-09-01.

## Objective

Give users fast access to the bot's primary private-chat actions without
requiring Telegram's command menu or typed slash commands. The interface uses
two complementary keyboards:

- a compact, persistent one-row reply keyboard for the most frequent actions;
- an expanded inline panel for additional actions that do not need to remain
  permanently visible.

The existing slash commands remain supported. The full `/start` introduction
also remains unchanged apart from attaching the persistent keyboard. `/help`
contains the detailed instructions and starts with a short product description
that points back to `/start` for a brief overview.

## Scope

This specification covers:

- the persistent reply keyboard attached by `/start`;
- the expanded inline action panel;
- routing of localized reply-keyboard labels;
- interaction with the ride wizard and AI creation dialog;
- closing inline panels;
- related `/start` and `/help` presentation changes.

It does not replace Telegram's slash-command menu, redesign individual command
screens, or make the main menu available in group chats.

## Persistent Main Menu

### Installation And Lifetime

The normal private `/start` response attaches a Telegram reply keyboard with:

- `is_persistent: true`;
- `resize_keyboard: true`;
- a localized input placeholder.

Telegram stores and renders this keyboard on the client side. It is not tied to
the lifetime of the `/start` message and does not depend on in-memory bot state.
It therefore remains usable after a wizard timeout or bot restart. A Telegram
client may allow the user to collapse the keyboard; `is_persistent` asks the
client to keep it readily available but cannot prevent client-side collapsing.
Sending another reply keyboard would replace it, and sending
`remove_keyboard: true` would remove it. Creation flows in this feature do
neither.

The keyboard is installed by the regular `/start` flow. A specialized
`/start calendar_<rideId>` deep link continues to show only the calendar inline
menu and does not send the normal welcome message or install the reply keyboard.

### Layout

The keyboard has exactly one row:

```text
[☰ Buttons] [➕ Create with wizard] [⚙️ Settings] [❓ Help]
```

Russian labels are:

```text
[☰ Кнопки] [➕ Создать мастером] [⚙️ Настройки] [❓ Помощь]
```

### Actions

- `☰ Buttons` / `☰ Кнопки` sends the expanded inline panel.
- `➕ Create with wizard` / `➕ Создать мастером` starts the same empty ride
  wizard as `/newride` without parameters.
- `⚙️ Settings` / `⚙️ Настройки` opens user defaults, equivalent to plain
  `/settings` and never to ride-scoped settings.
- `❓ Help` / `❓ Помощь` sends the same detailed help as `/help`.

Reply-keyboard buttons arrive from Telegram as ordinary text messages. The bot
matches their exact localized labels only in private chats and routes them
before wizard or AI free-text handling. Unrecognized text continues through the
normal creation-session handlers.

## Expanded Inline Panel

Pressing the persistent `Buttons` action sends a localized prompt and this
inline keyboard:

```text
[➕ Create with wizard] [🤖 Create with AI] [📋 Created rides]
[⚙️ Settings]          [❓ Help]
[✖️ Close]
```

Russian labels are:

```text
[➕ Создать мастером] [🤖 Создать через AI] [📋 Созданные райды]
[⚙️ Настройки]       [❓ Помощь]
[✖️ Закрыть]
```

The callback contract is:

| Callback | Result |
| --- | --- |
| `main:newride` | Start an empty ride wizard |
| `main:airide` | Start an empty AI-assisted creation dialog |
| `main:listrides` | Show the first page of rides created by the user |
| `main:settings` | Show user ride defaults |
| `main:help` | Send detailed help |
| `main:close` | Delete only the expanded-panel message |

Every inline action acknowledges its callback query. Selecting an action does
not automatically delete the expanded panel; the user may reuse it or remove it
with `Close`. Repeated close callbacks are idempotent: Telegram's expected
`message to delete not found` response is ignored, while other deletion errors
continue through normal error handling.

## Creation Sessions

The persistent keyboard remains present while the ride wizard or AI creation
dialog is active. Neither flow sends `remove_keyboard: true`.

Because reply-keyboard labels are routed before free-text creation input:

- pressing a main-menu button during a session invokes that menu action rather
  than treating its label as a ride field value;
- an abandoned, expired, or server-lost session does not leave the user without
  navigation;
- wizard cancellation and AI cancellation do not need to restore the keyboard.

Starting a wizard while the same user and chat already have an active wizard
keeps the wizard's existing "complete or cancel" behavior. Starting an AI
dialog while an AI dialog is already active keeps the existing active-session
warning.

## `/start` And `/help`

The regular `/start` command keeps the full localized Rich Message, including
its image, feature overview, quick start, and command references. Its only menu
change is the attached persistent keyboard.

The first paragraph of `/help` combines:

1. a concise description of creating, planning, publishing, tracking,
   configuring, attaching groups, and synchronizing rides;
2. a sentence directing users to `/start` for a brief overview of the main
   features and usage principles.

The remaining detailed help content and its two-message delivery stay
unchanged.

## Close Button Convention

The shared `buttons.close` translation is `✖️ Close` in English and
`✖️ Закрыть` in Russian. Existing interfaces that use this shared label inherit
the same icon, including:

- the created-rides list;
- the calendar provider menu;
- user settings;
- ride settings;
- the expanded main-menu panel.

Each close callback retains its existing behavior and scope. The expanded main
menu deletes only its own message and does not affect the persistent reply
keyboard.

## Architecture

- `src/telegram/MainMenuKeyboard.js` owns reply/inline keyboard composition and
  localized reply-label resolution. It contains no business logic.
- `src/commands/StartCommandHandler.js` attaches the persistent keyboard, sends
  the expanded panel, and closes that panel.
- `BaseCommandHandler` owns the common Telegram-facing menu adapters: a
  persistent action delegates to `handle()`, and an inline action acknowledges
  its callback before delegating to the persistent action.
- `NewRideCommandHandler` and `RideSettingsCommandHandler` override only the
  persistent action because reply-keyboard text cannot use their regular
  command parsing. `AiRideCommandHandler` overrides the inline action because
  it starts a dialog without `ctx.message`. List and help use the base behavior
  unchanged.
- `src/core/Bot.js` only maps localized persistent actions and callback patterns
  to those handler entry points.
- `src/i18n/locales/{en,ru}.js` owns all visible labels and prompts.

Menu entry points reuse existing command, wizard, and service flows. They do not
duplicate ride creation, listing, settings, or help business behavior.

## Reliability And Security Requirements

- Persistent text actions are recognized only in private chats.
- Inline callbacks use a dedicated `main:` namespace and fixed action names;
  no user-controlled data is parsed from them.
- Ride listing and settings continue to derive identity from `ctx.from.id` and
  retain existing ownership rules.
- The expanded close callback deletes the callback's own bot message only.
- No new persistence, external API, dependency, or authorization model is
  introduced.

## Testing

Coverage includes:

- both English and Russian reply-keyboard labels;
- exact persistent one-row layout and Telegram persistence flags;
- all reply-label-to-action mappings and unknown-text fallback;
- exact expanded inline layout and callback data;
- wizard, AI, list, settings, help, and close entry points;
- callback acknowledgement by inline handlers;
- absence of `remove_keyboard: true` during the wizard flow;
- deletion of the expanded panel without removal of the persistent keyboard;
- the revised `/help` introduction in both languages.

Standard verification is:

```bash
./run-tests.sh --mode basic
```

Mongo-mode tests are not required for this presentation and routing change.
