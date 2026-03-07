# Speed Field — 4 Input Forms + Avg Speed Label

## 1. Goal

Replace the ambiguous single-value speed behaviour (where a plain number like `25` was
stored as a minimum and displayed as "мин 25") with four clearly distinguished input forms.
At the same time rename the field label from "Speed / Скорость" to the more precise
"Avg speed / Ср. скорость", and centralise all speed parsing and formatting logic into a
single utility module.

---

## 2. Problem Statement

### Before

- Only two effective forms existed: a range (`25-28`) or a single number treated as the
  minimum (`25` → `speedMin=25, speedMax=null`).
- Single-number input was displayed as "мин 25 км/ч" / "min 25 km/h", which was misleading
  because users typically entered their average pace, not a hard lower bound.
- Parsing and formatting logic was duplicated across `FieldProcessor`, `wizardFieldConfig`,
  `MessageFormatter`, and `RideService`.
- No way to express a maximum-only speed.

### After

- Four distinct forms are supported (see table below).
- A single number is treated as an average speed and stored as `speedMin === speedMax`.
- Formatting uses `~` (approximately) for average, `+` suffix for minimum, and a localised
  "up to N" phrase for maximum.
- All parsing/formatting is centralised in `src/utils/speed-utils.js`.
- Field label renamed to "Avg speed" / "Ср. скорость" everywhere.

---

## 3. Input / Storage / Display

| User input    | Stored as                     | Displayed as (EN)    | Displayed as (RU)    |
|---------------|-------------------------------|----------------------|----------------------|
| `25-28`       | speedMin=25, speedMax=28      | `25-28 km/h`         | `25-28 км/ч`         |
| `25+` or `25-`| speedMin=25, speedMax=null    | `25+ km/h`           | `25+ км/ч`           |
| `-28`         | speedMin=null, speedMax=28    | `up to 28 km/h`      | `до 28 км/ч`         |
| `25` or `~25` | speedMin=25, speedMax=25      | `~25 km/h`           | `~25 км/ч`           |
| `-` (update)  | speedMin=null, speedMax=null  | *(field cleared)*    | *(field cleared)*    |

**No schema change.** Average speed is represented by the convention `speedMin === speedMax`.
Existing rides with `speedMin=N, speedMax=null` continue to display correctly as `N+ km/h`.

---

## 4. Architecture Decision — Centralised Utility

Speed logic previously appeared in at least four places with subtle differences. All
parsing and formatting is now in `src/utils/speed-utils.js`:

```
parseSpeedInput(text)  → { speedMin?, speedMax? } | null
formatSpeed(min, max, language)  → string
```

All call sites delegate to these two functions; no speed-formatting or speed-parsing logic
lives anywhere else.

---

## 5. Files Changed

### `src/utils/speed-utils.js` *(new)*

Single source of truth. Exports `parseSpeedInput` and `formatSpeed`.

- `parseSpeedInput`: strips optional leading `~`, then detects each form by pattern:
  - `-\d…` → max-only
  - `\d…[+-]` → min-only
  - `\d…-\d…` → range
  - plain number → average (`speedMin === speedMax`)
- `formatSpeed`: checks forms in priority order (avg → range → min-only → max-only).

### `src/utils/FieldProcessor.js`

`processSpeedField(value, isUpdate)` now:
1. Handles the clear-both case (`"-"` on update).
2. Delegates to `parseSpeedInput`.
3. When `isUpdate=true`, explicitly sets the unspecified bound to `null` so stale DB values
   are overwritten when the user switches forms.

### `src/wizard/wizardFieldConfig.js`

Speed field definition (validator, current-value formatter, confirmation formatter) all
reduced to one-liners via `parseSpeedInput` / `formatSpeed`. Wizard prompt updated to list
all four forms.

### `src/formatters/MessageFormatter.js`

`formatSpeedRange(min, max, language)` is now a thin wrapper that calls `formatSpeed`.

### `src/services/RideService.js`

Duplicate-ride speed reconstruction fixed. Previously `speedMax`-only was reconstructed as
a plain number (which would now parse as average). Fixed to canonical prefixed forms:
- avg → `"N"` (plain number)
- range → `"N-M"`
- min-only → `"N+"`
- max-only → `"-N"`

### `src/i18n/locales/en.js`

- `formatter.labels.speed`: `'Speed'` → `'Avg speed'`
- `wizard.confirm.labels.speed`: `'🚴 Speed'` → `'🚴 Avg speed'`
- `wizard.prompts.speed`: updated to describe all four forms
- `params.speed` help text: updated
- Removed keys: `formatter.speedMinPrefix`, `formatter.speedMaxPrefix`

### `src/i18n/locales/ru.js`

- `formatter.labels.speed`: `'Скорость'` → `'Ср. скорость'`
- `wizard.confirm.labels.speed`: `'🚴 Скорость'` → `'🚴 Ср. скорость'`
- `wizard.prompts.speed`: updated to describe all four forms in Russian
- `params.speed` help text: updated
- Removed keys: `formatter.speedMinPrefix`, `formatter.speedMaxPrefix`

### Tests updated

| Test file | What changed |
|-----------|-------------|
| `src/__tests__/utils/field-processor.test.js` | Full rewrite of speed section for 4 forms; single number now → avg |
| `src/__tests__/formatters/message-formatter.test.js` | Added avg case (`~25 km/h`); max-only uses `upToSpeed` translation |
| `src/__tests__/wizard/wizard-field-config.test.js` | Single value → avg (`speedMin===speedMax`); added min+/max- cases |
| `src/__tests__/services/ride-service.test.js` | `speed: '29'` → avg (speedMin=29, speedMax=29); added explicit `29+` min test |

---

## 6. Backward Compatibility

- Old rides stored with `speedMin=N, speedMax=null` continue to format as `N+ km/h` (minimum).
- Old rides stored with `speedMin=N, speedMax=M` (N≠M) continue to format as `N-M km/h` (range).
- The `speedMin === speedMax` convention is new; no existing data uses it accidentally because
  the old code never wrote equal min/max values.
- No database migration required.

---

## 7. Verification

```
./run-tests.sh --mode basic
```

Covers: `field-processor.test.js`, `message-formatter.test.js`,
`wizard-field-config.test.js`, `ride-service.test.js`, `i18n/locales-consistency.test.js`.

All 683 tests pass.

---

## 8. Definition of Done

- [x] `parseSpeedInput` and `formatSpeed` extracted to `speed-utils.js`
- [x] All 4 input forms parsed correctly
- [x] Average stored as `speedMin === speedMax`; displayed as `~N km/h`
- [x] Minimum displayed as `N+ km/h` (no "min"/"мин" prefix)
- [x] Maximum displayed as "up to N km/h" / "до N км/ч" (no "max"/"макс" prefix)
- [x] Update-mode null-clearing when switching forms
- [x] Duplicate-ride reconstruction uses canonical form for each case
- [x] Labels renamed to "Avg speed" / "Ср. скорость" in formatter, wizard, and confirmation
- [x] Wizard prompt lists all four forms in EN and RU
- [x] `speedMinPrefix` / `speedMaxPrefix` i18n keys removed
- [x] Locale consistency test passes
- [x] All basic tests pass
