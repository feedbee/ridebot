# Starting Points

Rides support up to five optional starting points. Existing multiline meeting text
remains one location unless its first non-whitespace content is a marker.

In the wizard, begin each point with a marker at the start of a line:

```text
S1: Main square
At the fountain
S2: Park
North gate
```

Markers accept uppercase or lowercase Latin S and leading whitespace. Their
numbers can be any nonnegative integer. Points are sorted numerically, retaining
input order for repeated numbers, then labeled consecutively S1–S5. For example,
S6 followed by S1 becomes S1 for the latter point and S2 for the former. Empty
marked points and more than five points are errors. Text preceding the first
marker makes the entire field ordinary multiline text.

Parameterized commands create points by repeating `meet:` without markers:

```text
/newride
title: Weekend ride
when: tomorrow 10:00
meet: Main square
meet: Park north gate
```

AI uses a string for one location or an array for explicitly described alternative
starts, in order of mention. It preserves descriptive line breaks within a point.

A single point is displayed in the existing format without a marker. Multiple
points use a native unordered list labeled S1–S5 under Meeting Point, retaining
existing section spacing. Their buttons occupy a row after pace groups, or after
participation buttons when pace groups are absent. Joined/thinking users and
pending applicants may select or change a point without approval or notifications.
Participant names show an optional `[S1]` suffix; pace-group grouping is unchanged.
Prompts request missing selections, combining start and pace choices when needed.

Selections survive Thinking → Joined and application acceptance. Skipping,
withdrawal, and rejection clear them. Edits retain choices by normalized position;
removed positions clear choices. Reducing to one point clears all choices and
hides buttons and suffixes. Duplicating copies meeting data without participants'
selections. Cancelled and archived rides follow existing selection restrictions.

## Implementation

`src/utils/start-points.js` owns parsing, normalization, labels, and display.
Optional `Ride.meetingPoints` stores normalized point strings, including single
points; `meetingPoint` retains scalar/canonical marked text for existing consumers.
Absent arrays are read as a single literal location, preserving old text even if
it contains marker-like lines. Markers are parsed only at input boundaries. `Participant.startPoint` stores
an optional S1–S5 label. Wizard data carries both representations to preserve
points during Keep and to clear them explicitly.

`RideParticipationService` serializes choices with status and pace-group changes
for each ride/user. Both storage implementations check current lifecycle,
participation, and available points. Mongo pipelines preserve the latest selection
on status changes and atomically clean removed choices using current participant
arrays. User contents are wrapped in `$literal` and pipeline patches are cast and
validated. Basic tests include Mongo query/schema contracts without a database.
