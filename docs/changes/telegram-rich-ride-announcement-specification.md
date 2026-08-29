# Specification: Telegram Rich Ride Announcements

## Status

Approved for implementation as the first Phase 3 experiment on 2026-08-29.

## Objective

Send and edit ride announcements as Telegram Rich Messages while preserving the established announcement content, ordering, spacing, participant presentation, keyboard behavior, persistence semantics, and localization.

## Scope

- Render the ride title as a Rich Message heading.
- Add the hosted green forest and mountain teaser as a photo block above the heading.
- Render the existing ride date and time as a native Telegram date-time entity backed by the ride's Unix timestamp.
- Keep every other field in its current order and retain the existing visual grouping and blank-line separation. Use `<br>` between lines inside a group and `<br><br>` for every visible empty line between groups; adjacent Rich HTML `<p>` blocks don't produce the spacing of the former regular message in Telegram clients.
- Keep joined and thinking participants comma-separated and preserve the existing truncation rules.
- Keep the existing count-only presentation for users who declined.
- Keep route links, creator/group instructions, cancellation state, ride ID, and the existing inline keyboard.
- Send new announcements with grammY's `replyWithRichMessage` and update all tracked announcements through rich `editMessageText` payloads.
- Extend reply-based ride ID lookup to recognize Rich Message announcements.

## Teaser Media Behavior

- Reference the teaser through `https://static.ridebot.valera.ws/ridebot-teaser.jpg` in the Rich HTML `<img>` block.
- Do not use `InputFile` or an `InputRichMessage.media` multipart upload for this experiment.
- Include the same teaser URL on both new announcements and synchronized edits, including edits of previously tracked announcements.

## Native Date-Time Behavior

Use Rich HTML `<tg-time>` with the ride timestamp and no `format` attribute. Keep the previously established localized date/time as the tag content so its exact presentation remains unchanged, while Telegram still recognizes it as a native date-time entity.

## Non-Goals

- Do not add participant avatars; Telegram Rich Messages have no native inline profile-avatar entity.
- Do not convert participant names into vertical lists.
- Do not hide thinking or declined participation in a collapsible block.
- Do not add multiple calendar-provider links or a calendar `<details>` demo in this slice. Preserve the existing “Add to calendar” link and keep it in the same visual block as the ride ID, separated by one line break.
- Do not add ride-specific images, maps, embedded buttons, or a regular-message fallback.
- Do not change wizard previews, ride lists, notifications, help, or other regular messages.

## Compatibility Requirements

- Commands replying to an announcement must continue resolving its ride ID. Check callback data from the replied announcement's inline keyboard, structured `rich_message` content, and the regular `text` field so both new and historical announcements remain supported, including payloads that contain both representations.
- Existing tracked regular announcements may be converted to Rich Messages on their next synchronized edit.
- User-originated text and URL attributes must remain HTML-escaped.
- Creator-only controls and participation callbacks must remain unchanged.

## Testing

- Formatter tests cover the heading, native timestamp, escaping, grouping, optional fields, cancellation state, and unchanged participant presentation in English and Russian.
- Service tests cover the hosted teaser URL on rich send and synchronized edits, topic send, and existing error handling.
- Ride ID extraction tests cover regular announcements and Rich Message replies.
- Scenario tests prove announcement creation and participation updates continue working; service tests cover reply-based ride ID resolution for both keyboard-backed and keyboardless Rich Messages.
- Run `./run-tests.sh --mode basic`.

## Success Criteria

- New and updated ride announcements are Rich Messages.
- The title is visibly a heading and the date/time is a Telegram date-time entity.
- A shallow green cycling teaser appears above the title on new and synchronized announcements.
- Content and interaction semantics are unchanged apart from those two presentation enhancements.
- Reply-based commands continue locating rides from both old regular announcements and new Rich Messages.
- The basic test suite passes.
