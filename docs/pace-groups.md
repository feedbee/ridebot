# Pace Groups

Rides support up to five optional pace groups, named A–E in input order. A ride
has groups when average moving speed or cruising speed contains at least two
values. Group count is the larger list length; lists need not be equally long.
A single speed value remains common to the entire ride.

Repeat `speed:` or `cruisingSpeed:` in parameter commands:

```text
/newride
title: Weekend Ride
when: tomorrow 10:00
speed: 20-28
cruisingSpeed: 30-32
cruisingSpeed: 25-28
cruisingSpeed: 20+
```

In the wizard, enter one speed per line. AI accepts the same values as strings
or arrays of strings. Existing scalar grammar is unchanged: `25`, `~25`,
`25-28`, `25+`/`25-`, and `-28`. An invalid element rejects the entire field.
More than five manual/AI values is an error. Strava imports only the first five
speed-based source groups, silently ignoring later entries; pace-based groups
remain descriptive text.

Joined participants, thinking users, and pending applicants select a group using
the second button row. The selection is optional and can be changed without
additional approval. Announcements and full lists display counts and membership
per group as native unordered Rich Message lists, with a separate unassigned item.
Speed groups in announcements and previews also use unordered lists, without
extra blank spacing. Capacity remains ride-wide.

Selection survives Thinking → Joined and application acceptance. Skipping,
withdrawal, and rejection clear it. Selecting/changing a group sends no organizer
notification and does not alter Telegram membership. Existing restrictions on
cancelled or archived rides still apply.

Editing a speed list replaces that entire characteristic; omitted fields remain
unchanged. An update value `-` clears it. Group identity is positional: editing
speeds or reordering rows retains people at their letters. Reducing group count
clears choices outside the remaining letters; adding those letters later does not
restore cleared choices. Duplicating copies speed data but no participants.

## Implementation Contract

`src/utils/pace-groups.js` wraps the existing single-speed parser and owns shared
normalization, derived letters, input reconstruction, and grouping. Single speeds
retain `speedMin`/`speedMax` or `cruisingSpeedMin`/`cruisingSpeedMax`. Lists use
optional `speedGroups`/`cruisingSpeedGroups` arrays of `{ min, max }`, clearing
the corresponding scalar bounds. `Participant.paceGroup` holds an optional letter.
Old rides need no migration; absent selection means unassigned when groups exist.

`RideParticipationService` serializes group choices with other operations for the
same ride/user. Storage checks lifecycle, current membership, and current group
existence at the conditional write boundary. Mongo selection, status transitions,
and speed-list cleanup use aggregation pipelines against current persisted
participants rather than service snapshots. Content pipelines explicitly cast and
validate supplied fields and wrap external values in `$literal`.

Mongo schema and query contracts run without a database in basic tests. Actual
Mongo infrastructure tests require a separately requested Mongo run. The Telegram
E2E lifecycle smoke also exercises group selection and Thinking preservation.
