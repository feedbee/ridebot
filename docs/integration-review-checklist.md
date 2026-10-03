# Integration review checklist

## Correctness and reliability

- [x] Enable Mongo update pipelines and encode participant profile text as literal data.
- [x] Track announcement additions and removals atomically.
- [x] Serialize participation changes and their notification/group side effects per ride and user.
- [x] Preserve settings patches during concurrent updates.
- [x] Preserve settings on own-ride duplication and apply explicit overrides.
- [x] Block archived chat edits through the shared lifecycle policy.
- [x] Report the actual participation outcome for creator and stale Apply callbacks.
- [x] Report transient propagation failures truthfully and retain announcement tracking.
- [x] Replace the invalid console.warning call.

## Deferred refactorings

- [x] Extract settings presentation and participant-limit input sessions from RideSettingsCommandHandler, preserving texts, keyboards and callback formats.
- [x] Share Mongo participant data, capacity predicates and participation pipeline builders.
- [x] Centralize ride defaults and boolean field names; share settings controls and remove obsolete helpers.
- [x] Enforce cancel/resume lifecycle policy through the service API and conditional storage writes.
- [x] Guard participation and moderation writes against crossing the archive boundary after the initial read.
- [x] Update living layer documentation and review the final diff.

## Validation

- [x] Basic tests: 71 suites, 1600 tests passed (`./run-tests.sh --mode basic`).
- [x] Mongo query contracts checked without a database, including literal input handling and archive date predicates.
- [x] Archive-boundary race tests verify unchanged participation and absence of notifications/group changes.
- [x] Settings command and scenario tests preserve the existing Telegram UI.
- [x] `git diff --check` passed.

Mongo mode was not run. Participation side-effect ordering remains local to one service instance/process, as documented in layer-responsibilities.md.
