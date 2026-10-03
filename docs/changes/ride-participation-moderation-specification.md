# Specification: Ride Participation Moderation

## Status

Product behavior approved on 2026-09-13. This document specifies the change only; implementation is a separate phase.

## Objective

Allow a ride creator to require approval before other users become confirmed participants.

Moderation is an optional per-ride mode. It is disabled by default, so existing rides and newly created rides continue to use the current direct `join` / `thinking` / `skipped` participation flow unless the creator opts in.

The feature must reuse the existing three persisted participation collections. Enabling or disabling moderation changes their product meaning and presentation, but does not migrate or copy participant records:

| Persisted state | Regular ride | Moderated ride |
|---|---|---|
| `joined` | Going | Application accepted |
| `thinking` | Thinking | Application awaiting a decision |
| `skipped` | Not participating | Not participating or application rejected |

This mapping allows moderation to be switched on and off repeatedly without rewriting participation data. A `thinking` participant becomes a pending applicant when moderation is enabled, and a pending applicant becomes a thinking participant when it is disabled. A `joined` participant remains confirmed in either mode.

## Goals

- Add a user default and a ride-scoped setting for participation approval.
- Keep existing participation storage and the three persisted states unchanged.
- Prevent non-creators from placing themselves directly into `joined` on a moderated ride.
- Give the ride creator an immediate private approval request with Accept and Reject actions.
- Notify an applicant privately when the creator accepts or rejects the application.
- Preserve attached-group membership semantics: only `joined` users belong to the group.
- Keep moderation-specific policy localized in the participation service and presentation helpers instead of scattering mode checks across command handlers.
- Preserve all current behavior for rides without moderation.

## Non-Goals

- Do not add new participation collections, statuses, application entities, audit history, rejection reasons, bans, or cooldowns.
- Do not migrate participants when the setting is toggled.
- Do not add co-organizers or allow anyone other than the ride creator to moderate applications.
- Do not add an alternative moderation inbox, application list with actions, reminder system, or retry mechanism.
- Do not guarantee delivery of private applicant-result notifications when Telegram does not allow the bot to message that user.
- Do not add moderation to the ride creation or edit wizard.
- Do not redesign unrelated ride lifecycle, sharing, cancellation, or notification preferences.

## Terminology And Canonical Setting

The canonical boolean setting is:

```js
ride.settings.requireParticipationApproval
```

The corresponding default for future rides is:

```js
user.settings.rideDefaults.requireParticipationApproval
```

`requireParticipationApproval` is preferred over a generic name such as `moderated` because it describes the exact behavior controlled by the flag and leaves room for unrelated kinds of moderation in the future.

System default:

```js
requireParticipationApproval: false
```

## Settings Semantics

The setting follows the existing ride-settings snapshot model:

1. The user setting is only a default for future rides.
2. Every new ride stores an explicit settings snapshot.
3. Changing the user default does not affect existing rides.
4. The creator may toggle the setting for an existing ride through ride-scoped `/settings`.
5. Toggling the setting does not move users between `joined`, `thinking`, and `skipped`.

Both user and ride settings screens show a localized boolean row and toggle action for participation approval.

The setting is also available to existing structured settings inputs:

- text-based creation and update flows through `settings.requireParticipationApproval`;
- AI ride creation or update when the structured setting is recognized;
- duplication through the existing settings-snapshot rules.

The wizard remains unchanged. Duplicate-own and duplicate-other behavior follows the existing settings architecture: duplicating one's own ride preserves its settings snapshot, while duplicating another user's ride uses the new creator's current defaults.

Legacy rides and users without the field resolve it to `false`. A storage migration should backfill the explicit setting consistently with the established ride-settings migration strategy so normal ride behavior does not depend on legacy shapes indefinitely.

## Participant Experience

### Regular rides

When `requireParticipationApproval` is `false`, behavior remains unchanged:

- `join` selects `joined`;
- `thinking` selects `thinking`;
- `skip` selects `skipped`;
- existing callback feedback, notifications, and group synchronization continue to apply.

### Moderated rides

A non-cancelled moderated ride shows two participation buttons to all users:

1. **Apply to participate**
2. **Not participating**

The keyboard is shared Telegram message state and is therefore intentionally not personalized to the viewer's current participation state.

For a user other than the creator:

- Apply to participate moves `none` or `skipped` to `thinking`.
- Applying while already `thinking` is an idempotent no-op with localized feedback that the application is already pending.
- Applying while already `joined` is an idempotent no-op with localized feedback that the user is already accepted.
- Not participating moves `thinking` or `joined` to `skipped`.
- Selecting Not participating while already `skipped` is an idempotent no-op.
- A rejected user may apply again immediately; `skipped -> thinking` creates a new actionable application.
- A previously accepted user who leaves and later applies again must be approved again.

For the ride creator:

- the creator is initially `joined` under the existing ride-creation behavior;
- the creator may select Not participating and move to `skipped`;
- if the creator later selects Apply to participate, the creator moves directly to `joined` without an approval request;
- creator self-actions do not produce creator-facing participation notifications.

The participant callback acknowledgement must use moderation-specific wording, including application submitted, already pending, and no longer participating. It must not tell an applicant that they joined before approval.

## Public Ride Presentation

Moderated rides reinterpret the existing public participation sections:

| Persisted state | Moderated label and display |
|---|---|
| `joined` | Accepted / participating; show count and participant names |
| `thinking` | Applications / awaiting approval; show count and applicant names |
| `skipped` | Not participating; preserve the current count-only presentation in the ride announcement |

The creator's detailed participants view also uses moderation-specific category labels and continues to list the users in all populated categories.

Switching moderation off immediately returns all ride messages to the regular labels and three regular participation buttons. Switching it on immediately returns them to the moderated labels and two moderated buttons. The persisted arrays and their ordering remain untouched.

Because settings changes affect the ride announcement presentation, a successful ride-scoped moderation toggle must refresh all tracked ride messages using the existing multi-chat propagation mechanism. A propagation failure must not roll back the persisted setting and must follow existing partial-failure handling.

## Application And Decision Flow

### Submitting an application

For a non-creator on a moderated ride:

1. The user selects Apply to participate.
2. `RideParticipationService` loads the current ride and evaluates its current settings.
3. The service requests a transition to `thinking`, regardless of which callback shape initiated the action.
4. Persistence removes the user from any previous participation collection and stores them in `thinking`.
5. The public ride messages are refreshed.
6. The creator receives an immediate private application notification with Accept and Reject buttons.

The service, not the keyboard callback name, is authoritative. A stale or manually constructed `join:<rideId>` callback must not let a non-creator bypass approval while moderation is enabled.

### Accepting

Only the ride creator may accept an application.

Accept is valid only when all of the following remain true at callback time:

- the ride exists and is not cancelled;
- the actor is `ride.createdBy`;
- participation approval is still enabled;
- the applicant's current state is `thinking`.

On success:

- move the applicant from `thinking` to `joined`;
- add the applicant to the attached Telegram group, if any;
- refresh all tracked ride messages;
- acknowledge the creator's callback;
- immediately attempt to send the applicant a private “application accepted” notification.

### Rejecting

Only the ride creator may reject an application. The same validity checks apply.

On success:

- move the applicant from `thinking` to `skipped`;
- ensure the applicant is not in the attached Telegram group;
- refresh all tracked ride messages;
- acknowledge the creator's callback;
- immediately attempt to send the applicant a private “application rejected” notification.

### Stale or unauthorized decisions

An Accept or Reject callback is stale when the applicant is no longer in `thinking`, the moderation setting has been disabled, the ride was cancelled, or the ride no longer exists.

Stale callbacks must not mutate participation. They return localized, safe feedback such as “This application has already been processed or is no longer active.” Repeated decision callbacks are therefore idempotent.

An actor other than the ride creator receives the existing creator-only style rejection and cannot mutate participation.

Concurrent Accept and Reject actions for the same application must result in at most one successful `thinking -> joined|skipped` transition. The storage/service operation must validate the expected current state atomically enough for both Memory and Mongo implementations; a read followed by an unconditional write is not sufficient.

## Notification Policy

Moderation introduces two operational notification categories that are separate from ordinary participation-change notifications.

### Application notification to creator

- Send immediately after a successful transition into `thinking` by a non-creator.
- Include the applicant identity, ride title and ride ID.
- Include localized Accept and Reject inline buttons.
- Do not debounce the notification.
- Do not gate it on `ride.settings.notifyParticipation`.
- Do not gate it on the creator's `participationNotificationLevel`.
- Delivery failure is logged and does not roll back the persisted application.

This notification is mandatory because it is the only moderation interface in scope.

### Decision notification to applicant

- Send immediately after a successful acceptance or rejection.
- Use distinct localized accepted and rejected templates.
- Do not debounce the notification.
- Do not depend on the creator's ordinary participation notification settings.
- Delivery failure, including the user never having opened a private chat with the bot, is logged and otherwise ignored.
- Do not introduce a public fallback, retry queue, or alternate delivery channel.

### Other participation notifications

Ordinary notification behavior remains unchanged for regular rides.

For moderated rides:

- a successful application uses the mandatory actionable application notification instead of the ordinary `thinking` notification;
- acceptance and rejection initiated by the creator do not generate an additional ordinary creator notification about the same state transition;
- leaving via Not participating may continue to use the existing ordinary creator notification policy, including its ride-level enablement, user notification level, and debounce behavior;
- creator self-actions remain suppressed.

The existing ordinary debounce duration is unchanged by this feature.

## Attached Telegram Group

Confirmed `joined` membership remains the single source of truth for attached-group access:

- submitting or resubmitting an application does not add the applicant;
- selecting Apply while already `joined` is a no-op and preserves group membership;
- accepting an application adds the user;
- rejecting an application does not add the user and removes them defensively if required;
- selecting Not participating from `joined` removes the user;
- changing the moderation setting alone does not add or remove anyone because participation arrays do not change.

Existing best-effort group-management error behavior remains in effect and must not corrupt persisted participation.

## Service And Layer Responsibilities

### Participation policy

Introduce one small, framework-agnostic participation-policy abstraction or localized service helpers that translate user intent and ride settings into persisted transitions and presentation semantics. The abstraction should answer narrow questions such as:

- whether approval is required for this actor and ride;
- which persisted state represents Apply for this actor;
- whether a moderation decision is currently valid;
- which labels and callback feedback correspond to the current mode.

It must not perform Telegram I/O or persistence. Avoid adding generic workflow infrastructure or a new domain model for this one boolean mode.

### `RideParticipationService`

The service owns all reusable business decisions:

- resolve Apply to `thinking` for non-creators and `joined` for the creator;
- prevent direct self-approval through legacy or forged callbacks;
- validate creator-only decisions and expected current state;
- coordinate participation persistence, operational notifications, and group membership;
- distinguish ordinary participation changes from moderation decisions;
- return structured outcomes for handlers to present.

Extend the service with intent-level operations or explicit decision methods rather than duplicating transition rules in Telegram handlers. Raw grammY contexts must not cross the service boundary.

### Command handlers and bot wiring

Handlers own Telegram callback parsing, `UserProfile` normalization, callback answers, and ride-message refresh requests. They do not decide whether a user requires approval or whether a decision is valid.

Callback data must remain within Telegram's size limit. A compact shape may be used, for example:

```text
apply:<rideId>
skip:<rideId>
application:accept:<rideId>:<applicantUserId>
application:reject:<rideId>:<applicantUserId>
```

Exact callback names are an implementation detail. Existing regular callbacks remain supported. Moderated rendering should use the new Apply callback to communicate intent clearly, while the service still protects against legacy callbacks.

### `NotificationService`

Keep ordinary debounced notifications and moderation operations as explicit paths within the notification layer. The application and decision messages should reuse safe participant-name and ride-title formatting, but should not be forced through the ordinary state-template/debounce API.

### `MessageFormatter` and participant lists

Presentation selects labels and keyboard shape from the effective ride settings. It does not decide state transitions or permissions. Centralize the mode-specific strings and category mapping so individual formatter replacements do not each grow independent boolean branches.

### `SettingsService`

Add the boolean setting to the single system-default and snapshot-resolution path. User-default and ride-setting updates must preserve all sibling settings.

### Storage

Keep `joined`, `thinking`, and `skipped` unchanged. Add only the boolean settings field to ride and user schemas/types. Provide a compare-and-transition operation, transaction, or equivalent storage contract needed to ensure that only a currently pending application can be decided once.

## Localization

Add matching English and Russian strings for:

- user-default and ride-setting labels, values, hints, and toggle buttons;
- Apply to participate and Not participating buttons;
- accepted-participants and pending-applications section labels;
- application submitted, already pending, and not-participating callback feedback;
- creator application message and Accept / Reject buttons;
- application accepted and rejected applicant messages;
- stale/already-processed decision feedback;
- creator-only and generic error paths if existing strings are not suitable.

All participant names and ride titles must use the existing safe HTML escaping rules.

## Compatibility And Migration

- The system default is `false`, preserving current behavior.
- Existing participation records need no migration.
- Existing ride messages are redrawn with the correct mode when a ride setting changes or another normal refresh occurs.
- Existing regular participation callbacks remain valid for non-moderated rides.
- Existing or forged direct-join callbacks cannot bypass moderation because the service resolves the transition from current ride settings and actor identity.
- Existing settings snapshots, user defaults, duplicate flows, imports, and structured AI inputs must preserve the new setting through the same shared resolution logic as other ride settings.
- No persisted pending approval notification or decision token is introduced. Telegram callbacks are validated against current ride state.

## Testing Strategy

Follow `docs/testing-conventions.md`. The main moderated journey requires scenario coverage, while state policy, concurrency, notification selection, and settings resolution require focused service/component tests.

### Policy and participation service tests

- regular rides preserve all existing `joined`, `thinking`, and `skipped` transitions;
- non-creator Apply on a moderated ride resolves to `thinking` from no state and `skipped`;
- non-creator Apply while already `joined` is a no-op;
- creator Apply resolves directly to `joined`;
- already-pending Apply is a no-op;
- Not participating moves pending and accepted users to `skipped`;
- rejected users may reapply;
- accepted users who leave must reapply and be accepted again;
- a legacy direct-join callback cannot bypass moderation;
- only the creator can accept or reject;
- decisions require current `thinking` state and enabled moderation;
- repeated and stale decisions do not mutate state;
- concurrent Accept and Reject produce exactly one successful decision;
- application, acceptance, and rejection choose operational notification paths rather than ordinary creator notifications.

### Notification tests

- application notification is immediate and includes both decision buttons;
- application notification ignores `notifyParticipation: false` and the creator's notification level;
- decision notifications are immediate and sent to the applicant;
- Telegram delivery failures do not fail or revert participation changes;
- application notification replaces the ordinary `thinking` notification;
- acceptance and rejection do not duplicate notifications to the creator;
- ordinary debounced notifications remain unchanged outside the specified exceptions.

### Settings tests

- missing values resolve to `false` without creating a user on read;
- user default can be toggled and affects only future rides;
- ride setting can be toggled only by the creator;
- ride setting changes preserve participation arrays and ordering;
- switching on and off repeatedly changes interpretation without moving records;
- sibling settings and live notification preferences are preserved;
- duplicate-own and duplicate-other settings semantics remain correct;
- structured text and AI inputs accept the optional setting without changing omitted-value behavior.

### Formatter and handler tests

- a regular ride retains three existing buttons and labels;
- a moderated ride renders exactly Apply and Not participating participation buttons;
- moderated `joined`, `thinking`, and `skipped` sections use the approved labels and visibility rules;
- creator and non-creator callback acknowledgements describe their actual outcomes;
- malformed, unauthorized, and stale decision callbacks are safe;
- toggling ride moderation refreshes all tracked ride messages.

### Scenario coverage

At minimum, add end-to-end in-process scenarios for:

1. creator enables moderation -> applicant applies -> creator accepts -> applicant appears as accepted;
2. applicant applies -> creator rejects -> applicant appears in `skipped` -> applicant reapplies;
3. accepted participant leaves -> reapplies -> requires acceptance again;
4. creator leaves -> reapplies -> returns directly to `joined`;
5. creator toggles moderation on and off with existing `joined`, `thinking`, and `skipped` users and no records move;
6. moderated ride with `notifyParticipation: false` still sends the actionable application message;
7. tracked copies in multiple chats receive the correct keyboard and labels after setting and participation changes.

## Commands

- Standard verification: `./run-tests.sh --mode basic`
- Focused Jest runs should use `./scripts/devcontainer-exec.sh npm run test:basic -- <test-paths>`.
- Mongo mode must not be run unless explicitly requested.

## Boundaries

### Always

- Enforce moderation in the service layer, independently of callback presentation.
- Keep settings resolution centralized in `SettingsService`.
- Preserve existing participant arrays when the setting changes.
- Escape user-controlled content in all new HTML notifications.
- Make decision callbacks permission-checked, current-state-checked, and idempotent.
- Run the basic test suite before implementation is considered complete.

### Ask first

- Adding a fourth participation state or a separate application entity.
- Adding new dependencies or a durable notification queue.
- Adding additional moderators, rejection reasons, bans, or an application-management screen.
- Changing ordinary notification debounce or existing notification-level semantics beyond the exceptions specified here.

### Never

- Allow a client callback name to bypass the current ride's moderation policy.
- Treat notification delivery success as a prerequisite for persisting an application or decision.
- Move participant records merely because moderation is toggled.
- Put reusable moderation rules in Telegram handlers or formatters.
- Run Mongo-mode tests by default.

## Success Criteria

The feature is complete when:

1. A creator can set the default for future rides and toggle approval on an existing ride.
2. Existing and default non-moderated rides behave exactly as before.
3. A non-creator cannot enter `joined` on a moderated ride without a current creator acceptance.
4. Applications, decisions, leaving, reapplying, creator self-rejoining, and stale callbacks follow the transitions in this specification.
5. Creator application notifications are immediate and mandatory; applicant decision notifications are immediate and best-effort.
6. Public messages and participant lists consistently reinterpret the existing three states without changing stored membership or order when the mode is toggled.
7. Attached-group membership continues to match only the `joined` collection.
8. Moderation policy is localized in the service/domain boundary and does not proliferate through handlers.
9. English and Russian localization remain consistent.
10. Relevant service, formatter, handler, settings, concurrency, notification, and scenario tests pass through the basic test entrypoint.

## Open Questions

None. Product behavior required for implementation is resolved.
