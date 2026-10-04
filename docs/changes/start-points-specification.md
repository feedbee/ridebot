# Additional Starting Points

## Objective and agreed behavior
Support one to five meeting points while preserving existing multiline descriptions.
Marked text is enabled only when the first non-whitespace content is `S<number>:`.
Markers are case insensitive, occur only at the beginning of a line, and may have
leading whitespace. Content extends to the next marker or the end of the field;
trim outer whitespace and preserve internal line breaks. Accept arbitrary numeric
labels, sort numerically (stable for duplicates), then renumber consecutively.
Reject more than five points and empty marked points. Unmarked text is one point.
Repeated `meet:` parameters are separate points without requiring markers.
AI returns an array for explicit alternatives, preserving order of mention.

One point uses the old display without its input marker. Several points use a
native unordered list under Meeting Point, labeled S1–S5, without extra section
spacing. Start-point buttons occupy their own row after pace groups or immediately
after participation buttons. Participant names gain an optional `[S1]` suffix;
pace-group grouping remains unchanged.

Selection is optional for joined/thinking users and pending applicants, changes
without notifications or approval, and survives acceptance and Thinking → Joined.
Skipping, withdrawal, rejection, removed positions, and reduction to a single point
clear selections. Edits retain choices by normalized position. Combined prompts
request whichever of start point and pace group remains unselected. Lifecycle
restrictions mirror pace groups. Duplicates copy meeting data without selections.

## Implementation plan
1. Shared parser, parameter accumulation, field validation, wizard help, and AI contract.
2. Persist normalized meetingPoints with canonical meetingPoint text for existing consumers.
   Store Participant.startPoint. Match pace-group atomic selection, preservation, and cleanup.
3. Announcement/preview/list rendering, keyboard row, callback, and combined prompts.
4. Focused parser, storage contract, and real bot scenario coverage; update living docs.

## Project constraints and verification
Follow docs/layer-responsibilities.md, docs/coding-preferences.md, and
docs/testing-conventions.md. Reuse current ES module/service patterns; no new
dependencies or migrations. Legacy scalar rides remain valid. Escape user content
and use literal values in Mongo aggregation pipelines. Unit tests cover parsing;
scenario tests cover visible participation and editing behavior; basic Mongo
contract tests verify atomic queries without a database.

Run commands via scripts/devcontainer-exec.sh when applicable:
- Focused: `./scripts/devcontainer-exec.sh npm test -- --runTestsByPath src/__tests__/utils/start-points.test.js src/__tests__/integration/start-points.test.js`
- Required suite: `./run-tests.sh --mode basic`
- Mongo mode only on explicit user request.
