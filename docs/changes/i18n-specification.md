# I18N Specification and Execution Plan

## 1. Goal

Add multilingual support to the Telegram bot with minimal regression risk:

- In phase one, language is controlled by config (`DEFAULT_LANGUAGE`).
- In later phases, the architecture is prepared for per-user/per-chat language selection.
- All user-facing strings are served through a single i18n layer.
- Tests are updated alongside the migration and protect against breakage.

---

## 2. Scope (What We Do Now)

### In Scope

- Introduce an i18n layer with keys and interpolation.
- Move user-facing text strings from code into locale dictionaries.
- Wire language selection from config.
- Update/add unit and integration tests for i18n behavior.
- Preserve current bot behavior (except configurable language output).

### Out of Scope (For Now)

- UI command/flow for user language selection.
- Persisting user language in the database.
- Full localization of external API content outside controlled bot strings.

---

## 3. Current State and Problem Areas

Strings are currently split across multiple places:

- Centralized:
  - `src/config/messageTemplates.js`
  - `src/config.js` (template wiring)
- Hardcoded in business/UI logic:
  - `src/formatters/MessageFormatter.js`
  - `src/wizard/RideWizard.js`
  - `src/wizard/wizardFieldConfig.js`
  - `src/commands/*`
  - `src/utils/*` (validation and error messages)

Risk: partial migration causes mixed-language output. We need phased migration with test gates.

---

## 4. Architecture Principles

1. One way to get text: `t(lang, key, params)`.
2. Strict fallback behavior:
   - unknown language -> `fallbackLanguage`
   - unknown key -> fallback locale -> missing key marker (in dev)
3. No human-readable category labels as domain identifiers.
4. Keep these concerns separate:
   - UI language (`i18n`)
   - Date/time formatting (`dateFormat.locale`, timezone)
5. Migrate by layers; each phase is closed by tests.

---

## 5. Target File Structure

```text
src/
  i18n/
    index.js              # t(), getLocale(), fallback logic
    locales/
      en.js               # EN dictionary (canonical)
      ru.js               # RU dictionary
    keys.js               # (optional) key constants
```

Config:

- `src/config.js`:
  - `i18n.defaultLanguage`
  - `i18n.fallbackLanguage`

ENV:

- `.env.example`:
  - `DEFAULT_LANGUAGE=en`
  - (optional) `FALLBACK_LANGUAGE=en`

---

## 6. Step-by-Step Execution Plan

## Phase 0. Baseline and Safety Net

### Changes

- Capture baseline test status.
- Add a startup smoke test with default config.

### Tests

- Run the full current test suite.
- Record that all tests are green before migration starts.

### DoD

- Stable baseline and clear understanding of existing test expectations.

---

## Phase 1. i18n Core + Config Language

### Changes

1. Add `src/i18n/index.js`:
   - `getLanguage(configuredLanguage)`
   - `getLocale(lang)`
   - `t(lang, key, params = {})`
2. Add `src/i18n/locales/en.js` and `src/i18n/locales/ru.js` (minimal starter key set).
3. Update `src/config.js`:
   - read `DEFAULT_LANGUAGE` and `FALLBACK_LANGUAGE`.
4. Add middleware/initialization for `ctx.lang` and `ctx.t`.
   - In this phase: `ctx.lang = config.i18n.defaultLanguage`.

### Tests

- New unit test: `src/__tests__/i18n/i18n.test.js`
  - returns correct string by key
  - interpolates params
  - language fallback works
  - key fallback works
- Update bot initialization tests to validate `ctx.t` availability.

### DoD

- i18n core is functional in the project.
- Language can be switched via env/config without business logic changes.

---

## Phase 2. Migrate Templates and Buttons to Locales

### Changes

1. Move `messageTemplates` and `buttons` into i18n keys:
   - `templates.start`, `templates.help1`, ...
   - `buttons.join`, `buttons.back`, ...
2. Remove direct dependency on `config.messageTemplates/buttons` in output paths.
3. Update `/start`, `/help`, `/shareride` paths to use `ctx.t(...)`.

### Tests

- Update:
  - `start-command-handler.test.js`
  - `help-command-handler.test.js`
  - button-related tests in `list-rides`, `delete`, wizard-related tests
- Prefer invariant assertions over full-text exact matching where practical.

### DoD

- Templates and button labels are sourced only through i18n.
- No direct usage of legacy `messageTemplates/buttons` in user-facing flow.

---

## Phase 3. Migrate MessageFormatter

### Changes

Move all user-facing strings from `src/formatters/MessageFormatter.js` to i18n:

- `When`, `Category`, `Organizer`, `Meeting point`, `Route`, `Link`
- `Distance`, `Duration`, `Speed`, `Additional info`
- `No participants yet`, `No one joined yet`
- `and {count} more`
- `Your Rides`, `Posted in ...`, `Not posted ...`, `Page ...`
- `message truncated due to length`

### Tests

- Update `src/__tests__/formatters/message-formatter.test.js`:
  - scenarios for EN and RU
  - interpolation checks for counts/params
  - fallback behavior checks

### DoD

- Formatter has no hardcoded UI strings.
- Formatter tests cover both locales on critical paths.

---

## Phase 4. Migrate Wizard and Validators

### Changes

1. `src/wizard/wizardFieldConfig.js`:
   - prompts, errors, labels -> i18n keys
2. `src/wizard/RideWizard.js`:
   - callback messages (`expired`, `invalid category`, `cancelled`, success/fail)
   - `Current value:` and confirm-step static labels
3. `src/utils/date-input-parser.js`, `src/utils/duration-parser.js`:
   - localized error texts via i18n (through params or injected `t`)

### Tests

- Update:
  - `ride-wizard.test.js`
  - `ride-wizard-edge-cases.test.js`
  - `duration-parser.test.js`
  - `date-input-parser.test.js`
- Add cases:
  - localized errors for invalid input
  - unchanged business logic across languages

### DoD

- Wizard is fully localized.
- Validator errors contain no hardcoded user-facing text.

---

## Phase 5. Migrate Command Handlers and Services

### Changes

Localize user-facing strings in:

- `src/commands/*`
- `src/services/RideService.js`
- `src/services/RideMessagesService.js`
- `src/utils/RideParamsHelper.js` (parameter help text)

Rule:

- User-facing replies/errors -> i18n.
- Technical `console.error` logs may stay in English for operations clarity.

### Tests

- Update command tests:
  - `cancel`, `delete`, `duplicate`, `list`, `participants`, `share`, `update`, `new`, `participation`
- Add table-driven tests to run core command flows under both languages.

### DoD

- No user-facing hardcoded English strings remain.

---

## Phase 6. Categories: Move to Stable Keys (Important)

### Changes

1. Introduce canonical category codes:
   - `mixed`, `road`, `gravel`, `mtb`, `mtb-xc`, `e-bike`, `virtual`
2. Store category code in ride data; render label via i18n.
3. Update:
   - `category-utils.js`
   - wizard options
   - formatter
   - parameter parser (`category`)
4. Data migration strategy:
   - map legacy stored strings to canonical codes on read/update or via migration script.

### Tests

- Update `category-utils.test.js`.
- Add backward compatibility tests:
  - legacy string categories from DB render correctly.

### DoD

- Category is language-agnostic at data level.
- Category label rendering depends only on locale.

---

## Phase 7. Finalization and Hardening

### Changes

- Remove legacy code/old template config (if no longer used).
- Verify all keys exist in both EN and RU.
- Add developer documentation for adding a new language.

### Tests

- Add locale consistency test/script:
  - no missing keys vs `en`
  - no unexpected extra keys (optional warning)
- Run full test suite including integration scenarios.

### DoD

- All tests are green.
- Locale dictionaries are consistent.
- Documentation is updated.

---

## 7. Test Update Strategy

## General Rules

1. Do not rewrite all snapshots into full exact texts at once.
2. Where possible, assert:
   - key fragments
   - presence of dynamic values
   - absence of fallback/missing markers
3. For critical formatted messages, keep exact expectations in EN + one RU smoke assertion.
4. Every new i18n key must be covered by at least one usage test.

## Test Matrix

- Unit:
  - i18n core
  - parser/validator message localization
  - category mapping
- Service:
  - localized create/update errors
- Command:
  - core command replies in EN/RU
- Formatter/Wizard:
  - rich text and inline keyboard labels
- Integration:
  - EN main-flow smoke
  - short RU smoke

---

## 8. Practical Execution Order (How We Work Through It)

1. Phase 1 (i18n core) + tests.
2. Phase 2 (templates/buttons) + tests.
3. Phase 3 (formatter) + tests.
4. Phase 4 (wizard/validators) + tests.
5. Phase 5 (commands/services) + tests.
6. Phase 6 (categories) + tests.
7. Phase 7 (hardening + docs + final full run).

After each phase:

- capture changes,
- run relevant tests,
- do not proceed with red tests.

---

## 9. Risks and Mitigations

1. Risk: mixed languages in a single message.
   - Mitigation: prohibit hardcoded strings in PR checks (targeted grep rule for key files).
2. Risk: key drift between `en` and `ru`.
   - Mitigation: locale consistency test.
3. Risk: breakage for legacy category data.
   - Mitigation: backward-compatible mapping + migration tests.
4. Risk: broad test failures due to text migration.
   - Mitigation: shift to invariant assertions where suitable.

---

## 10. Acceptance Criteria

- Language is configurable via `DEFAULT_LANGUAGE`.
- User-facing replies and buttons are localized.
- No critical hardcoded strings in user-facing paths.
- All tests pass.
- This document is actionable for step-by-step execution.

---

## 11. Next Step

Start with Phase 1: implement i18n core and baseline tests without changing business logic yet.

---

## 12. Definition of Done Checklist (Final)

### Product/Behavior

- [x] `DEFAULT_LANGUAGE` controls bot UI language globally.
- [x] `FALLBACK_LANGUAGE` is applied for unknown language/key fallback.
- [x] All user-facing command replies go through i18n.
- [x] All user-facing button labels go through i18n.
- [x] Wizard prompts/errors/confirm labels are localized.
- [x] Formatter labels and helper texts are localized.
- [x] Parser/validator user-facing errors are localized.

### Architecture/Code

- [x] Single translation entry point is used (`t(...)`, `ctx.t(...)`).
- [x] Legacy runtime template config usage is removed from user-facing paths.
- [x] Locale files exist for EN and RU with matching key structure.
- [x] Category is language-agnostic in data layer (stored as canonical code).
- [x] Category rendering uses locale keys (`categories.*`) and not stored labels.

### Tests/Quality

- [x] i18n core tests are present.
- [x] Command/wizard/formatter/service tests were updated for i18n migration.
- [x] Locale consistency test exists (`en` vs `ru` key parity).
- [x] Containerized basic suite passes (`./run-tests.sh --mode basic`).
- [x] Containerized mongo suite passes in this environment (`./run-tests.sh --mode mongo`)  

### Documentation

- [x] i18n execution spec maintained in this file.
- [x] Developer docs include how to add a new language.
- [x] Category storage strategy documented (see section 14 below).

---

## 13. Implementation Status Report

### Summary

Multilingual support is implemented end-to-end for EN/RU with config-controlled language, full user-facing string migration to i18n, and category model migration to canonical codes with backward compatibility.

### Phase Status

1. Phase 1 (i18n core + config): **Done**
2. Phase 2 (templates/buttons to i18n): **Done**
3. Phase 3 (MessageFormatter localization): **Done**
4. Phase 4 (wizard + validators localization): **Done**
5. Phase 5 (commands/services localization): **Done**
6. Phase 6 (stable category codes): **Done**
7. Phase 7 (hardening/docs/consistency): **Done** with one infra caveat for mongo test environment

### Hardening Completed

- Removed legacy `src/config/messageTemplates.js`.
- Removed `config.messageTemplates` / `config.buttons` runtime dependencies from user-facing code paths.
- Added locale consistency test:
  - `src/__tests__/i18n/locales-consistency.test.js`
- Added developer documentation in `README.md` ("Adding a New Language").

### Test Execution Status

- `./run-tests.sh --mode basic`: **PASS**
- `./run-tests.sh --mode mongo`: **PASS**

---

## 14. Category Storage in Database (What Changed)

### Before

- Category was stored as human-readable label text (mostly English), for example:
  - `"Road Ride"`
  - `"Regular/Mixed Ride"`
- This made stored data language-coupled and brittle for localization.

### After

- Category is stored as canonical stable code (string):
  - `mixed` (default)
  - `road`
  - `gravel`
  - `mtb`
  - `mtb-xc`
  - `e-bike`
  - `virtual`
- Database field type did not need structural migration (`String` -> `String`).
- Semantic migration was introduced via normalization logic.

### Runtime Compatibility Strategy

1. **On input parsing**: user input is normalized to canonical code.
2. **On storage write/update**: category is normalized before persistence.
3. **On storage read/map**: legacy stored labels are normalized to canonical code.
4. **On rendering**: code is converted to localized label via i18n `categories.*`.

This allows old records (legacy labels) to continue working without immediate bulk data migration.

### Optional Data Migration (Recommended for Cleanup)

For long-term consistency, run a one-time migration that rewrites existing legacy category labels in DB to canonical codes.  
This is optional for functionality (because read/write normalization is already backward-compatible), but recommended for data hygiene and easier analytics.

### Implemented One-Time Migration

Implemented as schema migration **v2**:
- `src/migrations/migrations/002_category_codes.js`
- wired in `src/migrations/MigrationRunner.js`

Behavior:
- Reads rides in batches.
- Normalizes `ride.category` via canonical mapping logic.
- Rewrites legacy labels/aliases to canonical codes.
- Fills missing/empty category values with `mixed`.
