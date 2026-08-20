# Plan 02 — Students & Schedule

**Source spec:** [`../specs/2026-08-17-jonathan-math-design.md`](../specs/2026-08-17-jonathan-math-design.md)
**Index:** [`2026-08-18-jonathan-math-phase1-index.md`](2026-08-18-jonathan-math-phase1-index.md)
**Depends on:** [Plan 01 — Foundation & Auth](2026-08-18-jonathan-math-01-foundation-auth.md)
**Date:** 2026-08-18
**Spec sections:** §3.3, §3.5, §4.2, §4.3, §5.1 (rest), §5.2, §5.3, §5.4 (schedule rows), §6 (unit + e2e path 4)

## End state

The teacher logs in and sees the full admin shell: sidebar student
directory, Today pinned above it, and a detail pane with Profile / Schedule
tabs (Chat tab is a stub until Plan 03). The teacher can create a student,
see the one-time credentials once, edit the profile, set a recurring
schedule, cancel or move individual occurrences, and archive or delete a
student. A student can log in with teacher-issued credentials, is forced
through change-password (Plan 01's mechanism, now actually exercised), and
lands on `/me` showing their next class and upcoming classes. Schedule
expansion is unit-tested against DST fixtures. E2E path 1, 2, and 4 from §6
pass. Chat is out of scope here — `/me/chat` and the teacher's Chat tab are
placeholders that Plan 03 fills in.

## New files, following Plan 01's layering

```
db/migrations/0002_students.sql
db/migrations/0003_schedule.sql
db/queries/students.ts
db/queries/schedule.ts                    class_slots + class_overrides rows
domain/schedule/expand.ts                 pure function — no db, no next/*
domain/schedule/conflicts.ts              pure — overlap detection
domain/students/dashboard.ts              getStudentDashboard: composes queries + expand()
domain/students/onboarding.ts             composes credentials.ts (Plan 01) + students query
app/(teacher)/layout.tsx                  role guard
app/(teacher)/page.tsx                    Today
app/(teacher)/students/page.tsx           sidebar directory
app/(teacher)/students/[id]/page.tsx      tabs: Profile · Schedule · Chat(stub)
app/(teacher)/students/new/page.tsx       create + one-time credential screen
app/(student)/layout.tsx                  role guard
app/(student)/me/page.tsx
app/(student)/me/chat/page.tsx            stub — Plan 03 builds it
```

---

## Task 1 — Students schema

Per §4.2.

```
0002_students.sql
  students   user_id → users (PK, one row per student)
             full_name · grade · school(nullable) · level
             objectives(text, nullable)
             private_notes(text, nullable)      teacher-only
             parent_phone(nullable) · parent_name(nullable)   teacher-only
             started_at
```

- `level`: reuse whatever enum-vs-check convention Plan 01 Task 4 settled on
  for `users.role`/`locale`/`status`.
- No `status` column here — a student's active/archived state lives on the
  linked `users.status` (Plan 01), which is why §3.4 calls the split
  deliberate: disabling login never destroys the teaching-history row.

## Task 2 — Schedule schema

Per §4.3.

```
0003_schedule.sql
  class_slots      student_id → students · weekday(0-6) · start_time(time, local)
                   duration_minutes · timezone(text, IANA name)
                   active_from(date) · active_until(date, nullable)

  class_overrides  slot_id → class_slots · original_date(date)
                   action(cancelled|moved)
                   new_date(date, nullable) · new_start_time(time, nullable)
                   note(text, nullable)
```

- `start_time` stored as a plain wall-clock time type (not `timestamptz`) —
  this is the schema-level enforcement of §4.3's "local wall-clock plus
  timezone identifier, not UTC" rule. Do not let a migration tool default
  this to `timestamptz`.
- Unique-ish constraint to consider: `class_overrides(slot_id,
  original_date)` — at most one override per slot per date, since §4.3 says
  "absence of a row means the pattern holds," implying presence means
  exactly one deviation, not several competing ones.
- Default `timezone` comes from `lib/env.ts`'s `DEFAULT_TIMEZONE`
  (`Asia/Almaty`, §7.6) at slot-creation time in the domain layer, not as a
  column default — a column default can't see the environment variable, and
  the value must be explicit per row per §7.6 ("treat the zone as a
  parameter throughout, never as a constant").

## Task 3 — `domain/schedule/expand.ts` — the pure function

Per §3.3, the single most important structural decision in the design.
**Imports nothing but Luxon.** No `db/`, no `next/*`, not even
`lib/env.ts`. Enforced by a lint rule or a test that inspects the module's
imports — pick one and wire it into CI, since this is the constraint the
index calls out as the one thing layering must never let leak.

Signature: `expandOccurrences(slot: ClassSlot, overrides: ClassOverride[],
range: {from: DateTime, to: DateTime}): Occurrence[]`.

Implementation per §7.2's corrected Luxon findings:

- Resolve each candidate occurrence with
  `DateTime.fromObject({...}, { zone: slot.timezone })`.
- **Do not trust `.isValid`/`invalidReason`** to catch a spring-forward gap
  — verified false in §7.2. Instead round-trip the wall-clock fields: if
  `dt.hour !== requested.hour || dt.minute !== requested.minute`, the
  requested local time didn't exist in that zone that day. Decide
  explicitly what happens to that occurrence (shift to the resolved time,
  or skip it and flag it) — §7.2 requires a decision here, not a default.
- Autumn ambiguity (a wall-clock time occurring twice) resolves to the
  **earlier** offset — this is Luxon's actual default behavior, confirmed
  correct in §7.2, so no extra handling needed beyond documenting it.
- Apply overrides after generating the base pattern: a `cancelled` override
  removes that date's occurrence; a `moved` override replaces its date
  and/or start time with `new_date`/`new_start_time`. An override whose
  `original_date` has no matching base occurrence (e.g. outside
  `active_from`/`active_until`) is inert, not an error.
- Respect `active_from` / `active_until` bounds and the requested `range`.

**Definition of done:** unit tests, per §6, cover — DST spring-forward gap
and autumn ambiguity (fixture zone `Europe/London`, per §7.6, since
`Asia/Almaty` has none), an override landing on an already-cancelled date,
a pattern ending mid-week, and an occurrence affected by a slot edited after
the fact (i.e. expansion always reflects the *current* slot row, never a
cached prior version).

## Task 4 — `domain/schedule/conflicts.ts`

Per §5.4: "Two overlapping class slots → rejected at save, naming the
conflicting slot."

Pure function taking a candidate slot and the student's (or, if slots can
ever be teacher-wide, all) existing slots, returning the conflicting slot if
any weekday+time-range overlap exists, accounting for each slot's own
timezone when comparing (two slots in different zones can still collide in
real time). Reuses `expand.ts`'s wall-clock resolution logic rather than
duplicating it — factor the shared piece out if it starts to fork.

## Task 5 — `db/queries/students.ts`, `db/queries/schedule.ts`

Hand-written SQL, row types declared next to each query, per §7.4.

`students.ts`: `create`, `findById`, `listActive` (joins `users` for
`status`), `update` (profile fields), `archive` (sets `users.status =
'archived'`, invalidates sessions via Plan 01's
`sessions.deleteAllForUser`), `delete` (hard delete, only ever called behind
the typed-confirmation flow in Task 12 — never exposed as a plain DELETE
route).

**Cross-student isolation, per §3.4:** every function that takes a
`studentId` on behalf of a *student* caller (as opposed to the teacher, who
can see all) re-checks `user_id` ownership inside the query, not just in the
calling page. This is the redundant check the spec insists on — a routing
mistake in `app/(student)/*` must not become a cross-student data leak.
Integration tests for this belong in Task 13.

`schedule.ts`: `listSlotsForStudent`, `createSlot`, `updateSlot`,
`deleteSlot`, `listOverridesForSlot`, `createOverride`, `deleteOverride`.

## Task 6 — `domain/students/onboarding.ts`

Per §5.2, composing Plan 01's `domain/auth/credentials.ts` with
`db/queries/users.ts` and `db/queries/students.ts`.

1. Generate username + one-time password (Plan 01 Task 7).
2. Create the `users` row (`role = 'student'`, `must_change_password =
   true`) and the linked `students` row in one transaction.
3. Return the plaintext credentials to the caller **once** — nothing
   persists the plaintext password anywhere past this call; only the hash
   is stored.

## Task 7 — `domain/students/dashboard.ts`

Per §3.5's worked request-flow example — this is the function that example
describes.

`getStudentDashboard(studentId)`: composes the profile query and the
schedule query, runs `expandOccurrences` over "today through N days ahead"
(pick a horizon — e.g. 14 days, enough for "upcoming classes" per §5.1
without over-fetching), returns a plain object with profile fields
(excluding `private_notes`/`parent_phone`/`parent_name` — see Task 10) plus
the occurrence list. This is `domain/`, so it may call `db/` per the
layering note, but returns data, not JSX.

## Task 8 — Teacher admin shell

Per §2 (layout decision) and §5.1 routes.

- `app/(teacher)/layout.tsx`: role guard (§3.4 boundary check #1) — redirect
  anything not `role = 'teacher'` and not past `must_change_password`.
  Renders the persistent sidebar (student directory, Today pinned above it)
  around whatever page is active.
- `app/(teacher)/page.tsx` — **Today**: today's classes (expand each active
  student's slots for just today, per Task 3/7) and unread messages. Unread
  count here is a stub returning 0 until Plan 03 builds `read_markers` —
  note this explicitly in the component so it isn't mistaken for a bug.
- `app/(teacher)/students/page.tsx` — sidebar directory list (active
  students only by default, per §5.3 "archive hides from the active list";
  archived students need to be reachable somehow for un-archiving — decide
  a small "show archived" toggle here, since §5.3 doesn't specify the UI for
  it, only the data behavior).

## Task 9 — Student detail pane

Per §5.1: `/students/[id]` with Profile · Schedule · Chat tabs.

- Profile tab: view/edit `full_name`, `grade`, `school`, `level`,
  `objectives`, `private_notes`, `parent_phone`, `parent_name`. This is the
  one screen where the teacher-only fields are shown — reinforce in the
  component (or better, at the query layer per Task 5) that this data path
  is never reused for anything a student-authenticated request can reach.
- Schedule tab: list of the student's `class_slots`, add/edit/delete a slot
  (running Task 4's conflict check before save and surfacing the named
  conflict per §5.4), and a per-occurrence view (next N weeks) where a
  single occurrence can be cancelled or moved, creating a `class_overrides`
  row. Cancelling a past occurrence is allowed but flagged per §5.4 ("may be
  a record correction").
- Chat tab: stub placeholder ("coming in the next update" or similar) — real
  content is Plan 03.

## Task 10 — Student creation & credential reveal

Per §5.2, using Task 6.

- `app/(teacher)/students/new/page.tsx`: form for the profile fields, submit
  calls `onboarding.ts`.
- On success, render the confirmation screen showing username + one-time
  password, copyable, with a clear one-time warning ("this password cannot
  be shown again — reissue if lost"). No route or state keeps this
  reachable after navigating away.
- "Reissue" affordance (implied by §5.2's "teacher reissues instead"):
  generates a fresh one-time password for an existing student, invalidates
  their existing sessions (they're about to be forced through
  change-password again), reuses Task 6's generator. Small enough to fold
  into the Profile tab rather than a separate page.

## Task 11 — Archive / delete

Per §5.3.

- Archive: default action from the student list/detail pane. Sets
  `users.status = 'archived'`, disables login (Plan 01's login flow already
  checks this per its Task 13), invalidates existing sessions immediately,
  keeps every other row untouched.
- Un-archive: the flip side, needed since Task 8 added a "show archived"
  view — restores `users.status = 'active'`. Does **not** reissue
  credentials or force a password change; the old ones still work unless
  separately reissued.
- Delete: separate destructive action, gated behind a typed confirmation
  (e.g. type the student's name to confirm) per §5.3's "deliberate action."
  Removes the `students` row and, per FK design, cascades to
  `class_slots`/`class_overrides` — decide whether `messages` also cascades
  here or is out of scope until Plan 03 adds that table; note the answer in
  Plan 03's own delete-cascade task so it isn't decided twice.

## Task 12 — Student page

Per §5.1: `/me`.

- `app/(student)/layout.tsx`: role guard, mirroring Task 8's teacher guard
  but for `role = 'student'`, plus the §3.4 ownership re-check pattern
  applied to every query this layout's pages call (Task 5 already builds
  this into the query layer; the layout itself just confirms role +
  session).
- `app/(student)/me/page.tsx`: next class (soonest upcoming occurrence) and
  upcoming classes list (Task 7's dashboard, minus teacher-only fields,
  which the query layer already excludes), plus `objectives` as read-only
  prose. Single column, phone-first, per §2's layout decision.
- `app/(student)/me/chat/page.tsx`: stub, same as Task 9's Chat tab —
  real content is Plan 03.

## Task 13 — Tests

Per §6.

- Unit: Task 3 and Task 4's DST/conflict fixtures (the bulk of §6's "Unit —
  owns schedule expansion" requirement).
- Integration: `db/queries/students.ts` and `schedule.ts` against real
  Postgres, **including the cross-student isolation checks from §3.4** —
  a test that a student-scoped query called with another student's id
  returns nothing, not another student's row.
- E2E (Playwright, §6):
  - Path 1: teacher creates a student, receives credentials.
  - Path 2: that student logs in, is forced to change password (exercises
    Plan 01 Task 14 for the first time with a real forced case).
  - Path 4: schedule renders correctly with a cancellation and a move
    applied — drive this through the actual UI (Task 9's schedule tab),
    not just the domain function, so it also catches a wiring bug between
    `expand.ts` and the page.

**Definition of done for the whole plan:** all of the above green, plus a
manual pass — create a student through the UI, copy the credentials, log in
as that student in a private window, get forced through change-password,
land on `/me` and see the schedule correctly, go back as the teacher and
cancel one occurrence and move another, confirm both changes reflect
immediately on the student's `/me`, archive the student and confirm their
session is dead and login is blocked with the §5.4 message.
