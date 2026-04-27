# Release Changelog

This changelog is written for product-facing release notes. Release dates are based on Git tag creation dates.

## v2.5.0 - 2026-04-27

- **Imported rides from Strava club events with `/fromstrava`.**  
  Users can paste a Strava club group event URL and let the bot create a ride from the event data. The import fills title, date, meeting point, category, route links, distance, duration, pace-derived speed range, organizer, and additional info. Re-importing the same event by the same user updates the existing ride across all chats instead of creating a duplicate.

- **Made attached ride groups more discoverable and easier to join.**  
  Attached Telegram groups now get renamed to the ride title and date, ride messages show a prominent group-chat notice, and participants can request a single-use invite link with `/joinchat #rideId` in private chat. Attach and detach flows update existing ride messages so the group-chat instructions appear and disappear consistently.

- **Added support for multiple route links per ride.**  
  Rides can now store an ordered list of route links with optional custom labels, covering use cases like Strava plus Komoot, short and long variants, or backup routes. Multi-route input works in parameter mode, wizard flows, AI mode, Strava imports, and message rendering while preserving compatibility with older single-route rides.

- **Improved AI ride creation and editing.**  
  `/airide` now enriches previews with route-derived distance and duration, supports update mode from a reply to a ride message, understands multiple routes, and handles organizer data more cleanly so self-references are not shown as awkward organizer names.

- **Added creator auto-participation for new rides.**  
  Ride creators are added as initial participants when they create a ride, including rides created through the wizard and Strava import. This makes the participant list match the expected real-world state without requiring creators to join their own rides manually.

- **Added private ride management buttons for creators.**  
  Creator-owned ride messages in private chat now include owner-only actions for editing, duplicating, deleting, cancelling or resuming, listing participants, and opening settings. These controls are hidden from non-creators and from group/shared ride messages.

- **Introduced user defaults and per-ride settings with `/settings`.**  
  The bot now has a first-class settings model. Users can configure defaults for future rides, and creators can configure individual rides. The first settings include participation-change notifications and repost permissions, with existing notification data migrated into the new ride settings structure.

- **Added repost permission controls for `/shareride`.**  
  By default, only the ride creator can repost a ride, but creators can allow other users to repost via ride or user default settings. Duplicating your own ride preserves its settings, while duplicating someone else's ride applies your own defaults.

- **Fixed several ride sharing, group, and message update edge cases.**  
  The bot now prevents attaching one group to multiple rides, shows command-specific usage for group commands, preserves each message's audience and language during updates, and keeps creator-private messages from losing creator-specific UI after refreshes. Wizard cancel messages and AI preview edge cases were also cleaned up.

- **Expanded real Telegram end-to-end testing and agent documentation.**  
  A full Telegram E2E smoke layer was added for critical real-platform flows such as message delivery, edits, callbacks, and wizard journeys. Project documentation was reorganized around agent-facing architecture, coding, and testing guidance.

- **Updated bot help for the new feature set.**  
  The in-bot `/help` text now covers Strava import, multiple routes, `/settings`, `/joinchat`, private creator buttons, and repost permissions. It is split into multiple Telegram-safe messages so the expanded help stays under platform length limits.

## v2.4.1 - 2026-04-06

- **Documented AI ride creation and editing.**  
  README, bot help, and the specification were updated to explain `/airide`, including natural-language creation, updating an existing ride with `/airide #rideId`, preview confirmation, and the AI dialog flow. This release focused on documentation rather than changing the product behavior introduced in v2.4.0.

## v2.4.0 - 2026-04-06

- **Added AI-powered ride creation and editing with `/airide`.**  
  Users can describe a ride in free-form text and have the bot extract structured ride fields, show a preview, and save the ride after confirmation. The command supports both creating new rides and editing existing rides with a `#rideId` prefix, while preserving unchanged fields in update mode.

- **Changed `/airide` into an iterative dialog.**  
  Instead of a one-shot parse flow, `/airide` now lets users refine the ride across multiple messages. The bot keeps one live preview message updated in place and validates required fields on confirmation, so users can add missing title or date details without restarting.

## v2.3.2 - 2026-03-19

- **Handled invite-link delivery when participants have not started the bot.**  
  If Telegram blocks the bot from sending a group invite link to a participant because the participant has not opened a private chat with the bot, the bot now sends the invite link to the ride creator instead. The creator can forward it manually, preventing participants from getting stuck outside the attached ride group.

## v2.3.1 - 2026-03-19

- **Required supergroups for group attachment.**  
  `/attach` now clearly requires a Telegram supergroup instead of attempting to work in regular groups where the needed platform behavior may be unavailable or inconsistent. Users get a specific message explaining the requirement.

## v2.3.0 - 2026-03-19

- **Added Telegram group attachment for rides.**  
  Ride creators can attach an existing Telegram group with `/attach #rideId` and unlink it with `/detach`. The bot verifies permissions, posts and pins the ride message in the group, and syncs group membership as people join or leave the ride.

- **Added debounced participation notifications for creators.**  
  Creators can opt in to private notifications when participants join, think, or skip. Notifications are debounced for 20 seconds, so quick status changes result in one final message instead of a burst of updates. Notification messages include a quick command snippet for turning them off.

- **Added live preview to wizard flows.**  
  The wizard now shows a separate ride preview message from the first step and updates it as fields are filled in. The confirmation step relies on the preview rather than a plain field list, making it easier to see what the final ride announcement will look like.

- **Improved wizard and message-update UX.**  
  Text input is silently ignored on button-only wizard steps, preventing accidental messages from disrupting the flow. The bot also suppresses harmless Telegram "message is not modified" errors during ride message updates.

## v2.2.2 - 2026-03-08

- **Moved Strava route parsing from HTML scraping to OAuth API integration.**  
  Strava route enrichment now uses authenticated API access instead of relying on brittle page scraping. The release added token storage, token refresh helpers, encryption utilities, and setup tooling for Strava OAuth.

- **Improved safety for Strava credentials.**  
  New configuration and encryption support make Strava token handling more explicit and safer. This reduces the chance that route parsing breaks due to website changes and avoids storing sensitive token material in plain form.

## v2.2.1 - 2026-03-07

- **Improved multilingual date recognition and display.**  
  The bot became better at understanding dates in multiple languages and displaying ride dates in the user's local language. The release also documented `DEFAULT_TIMEZONE` for clearer time handling.

- **Expanded route parsing across Komoot, RideWithGPS, and Garmin Connect.**  
  Komoot and RideWithGPS route/activity parsing were fixed, and Garmin Connect courses and activities were added. Wizard fields for distance and duration now show values parsed from route links when available.

- **Made speed input more expressive.**  
  Users can enter speed as a range, minimum, maximum, or average value. Ride messages now label this as average speed more clearly, and internal speed handling was refactored for consistency.

- **Fixed speed range updates.**  
  Updating a ride's speed range now correctly recalculates and stores the intended min/max values instead of leaving stale or inconsistent speed data behind.

## v2.2.0 - 2026-03-05

- **Added English and Russian localization infrastructure.**  
  User-facing text moved into an i18n layer with English and Russian locale files, covering commands, help, wizard prompts, errors, and message formatting. This prepared the bot for localized interactions and future language expansion.

- **Migrated ride categories to stable internal codes.**  
  Ride categories now use canonical internal codes while display labels are localized. A migration converts older stored category labels so existing rides continue to render correctly.

- **Strengthened testing and CI workflows.**  
  The test runner became devcontainer-aware, testing conventions were documented, behavior-oriented coverage was expanded, and CI checks were aligned around full-suite verification. This release laid groundwork for safer future feature work.

## v2.1.0 - 2025-10-06

- **Introduced three-state ride participation.**  
  Participation changed from a simple join/leave model to `joined`, `thinking`, and `skipped` states. Ride messages now show separate counts and sections for people who are joining, considering, or not interested.

- **Added `/listparticipants` for complete participant lists.**  
  Ride messages keep participant display compact by showing names inline and truncating long lists, while `/listparticipants` provides a full untruncated view for organizers and users who need the details.

- **Added database migrations for participation states.**  
  Existing rides with the old `participants` array are migrated into the new structured participation model. The release added a MongoDB migration framework and a migration script for the new participation schema.

- **Added a private sharing hint for ride creators.**  
  Creator-facing private ride messages now include a `Share this ride: /shareride #id` line, making it easier to repost without hunting for the ride ID. A follow-up fix ensured the line remains visible after ride updates.

- **Improved participant and ride message formatting.**  
  Participant names became easier to scan, long participant lists are summarized, and the route icon was updated to a clearer map symbol. These changes reduced visual noise in ride announcements.

## v2.0.1 - 2025-10-04

- **Improved onboarding through `/start`.**  
  The start message was rewritten into a clearer quick-start guide that explains the bot's core value, first steps, and where to find detailed help. The result is less overwhelming for new users.

- **Replaced `@botname` placeholders with the real bot username.**  
  Help and onboarding messages now resolve the bot's actual Telegram username for full command examples such as `/shareride@mybot`. This makes group-chat usage clearer and avoids copy-paste confusion.

## v2.0.0 - 2025-10-04

- **Renamed `/postride` to `/shareride`.**  
  The ride repost command was renamed to better match the user action: sharing an existing ride into another chat. The command menu, help text, README, specification, and handler naming were updated while preserving the same synchronized multi-chat posting behavior.

## v1.2.1 - 2025-10-04

- **Fixed test failures around application startup.**  
  This patch corrected `index.js` tests after the v1.2.0 refactoring work. It did not introduce user-facing bot behavior changes, but restored confidence in the automated test suite for the application entry point.

## v1.2.0 - 2025-10-04

- **Made private chat the default place for ride management flows.**  
  Wizard-based ride creation and most management commands were made private-chat-only by default, removing feature flags that previously controlled this behavior. This reduced noise in public chats and made the recommended flow clearer: create and manage rides privately, then share them into groups.

- **Refactored the ride wizard and command architecture for maintainability.**  
  The wizard was reorganized around declarative field configuration, and bot command wiring moved toward a centralized configuration model. Common command behavior was extracted into shared handler helpers, making future features easier to add consistently.

- **Centralized ride field processing and validation.**  
  Parameter parsing, validation, and duplicate ride field processing were pulled into shared utilities and service methods. This reduced duplicated logic across create, update, and duplicate flows and made error handling more consistent for power-user parameter mode.

- **Improved ride input ergonomics.**  
  Users gained human-readable duration input such as `2h 30m`, better parameter validation, inline category selection in the wizard, and clearer handling for optional fields. These changes made both wizard and text-command creation less brittle.

- **Improved ride message reliability across chats and topics.**  
  The bot became more robust at tracking ride messages posted across multiple chats and Telegram topics, cleaning up unavailable messages, and handling bot-name-qualified commands such as `/command@BotName`. Timezone handling and ride detail formatting were also improved.

- **Added organizer support and clearer ride details.**  
  Rides gained an organizer field, and ride details were reformatted into more logical groups for readability. This made ride announcements easier to scan and gave organizers a dedicated place in the ride data.

- **Added CI, coverage, and build pipeline improvements.**  
  GitHub Actions workflows, DockerHub publishing, manual workflow triggers, package lock tracking, and coverage reporting were added or strengthened. This release significantly improved project delivery infrastructure alongside product-facing changes.

## v1.1.0 - 2025-09-27

- **Established the core bike ride organizer experience.**  
  The earliest tagged release included the main ride lifecycle: create rides, update them, cancel or resume them, delete them, duplicate them, list your rides, and let participants join or leave through inline buttons.

- **Added multi-chat synchronized ride announcements.**  
  Rides could be created once and posted into multiple chats, with participant changes and ride updates synchronized across tracked messages. The bot also handled unavailable messages when chats, posts, or permissions changed.

- **Added wizard and parameter modes for ride creation and editing.**  
  Users could create and edit rides through an interactive step-by-step wizard or through multi-line text parameters. This supported both beginner-friendly guided input and faster power-user workflows.

- **Added route, date, duration, category, and timezone handling.**  
  The bot could parse route links from providers such as Strava, RideWithGPS, and Komoot, understand natural-language dates, format times with timezone awareness, parse durations, and classify rides by category.

- **Added production-ready Telegram and storage foundations.**  
  The project included webhook support, topic/thread support, MongoDB and in-memory storage implementations, HTML-safe message formatting, and a comprehensive Jest test suite. This created the foundation for the later 2.x feature work.

## 1.0.0 - 2025-03-04

- **Launched the initial bike ride organizer bot.**  
  This historical release predates the git tag history and is recorded from the original project changelog. It introduced the first version of the Bike Ride Organizer Bot with basic Telegram integration, command handling, storage foundations, and core ride management capabilities.
