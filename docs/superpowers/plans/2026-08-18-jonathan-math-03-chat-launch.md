# Plan 03 — Chat & Launch

**Source spec:** [`../specs/2026-08-17-jonathan-math-design.md`](../specs/2026-08-17-jonathan-math-design.md)
**Index:** [`2026-08-18-jonathan-math-phase1-index.md`](2026-08-18-jonathan-math-phase1-index.md)
**Depends on:** [Plan 01 — Foundation & Auth](2026-08-18-jonathan-math-01-foundation-auth.md), [Plan 02 — Students & Schedule](2026-08-18-jonathan-math-02-students-schedule.md)
**Date:** 2026-08-18
**Spec sections:** §4.4, §5.1 (chat), §5.4 (chat rows), §6 (e2e paths 1–3), §7.3, §8

## End state

Teacher and student can message each other live, in both directions,
surviving a dropped connection without losing a message. Unread badges
appear on the teacher's sidebar/Today and the student's Chat tab. Either
user can switch their own locale between Russian and English. Database
errors and other failures show a generic page, never a stack trace or
connection string. Nightly backups run to Cloud Storage. All four §6 e2e
paths pass end to end. The go-live checklist gates the switch off
`localhost` — this plan does not itself acquire a domain, but it builds and
documents the one-line switch §8 promises, and enforces the hard rule that
no student is onboarded before HTTPS works.

## New files

```
db/migrations/0004_chat.sql
db/queries/messages.ts
db/queries/read_markers.ts
domain/chat/unread.ts                     unread-count logic, pure given rows
app/api/chat/[studentId]/stream/route.ts  SSE — GET, ReadableStream, text/event-stream
app/api/chat/[studentId]/send/route.ts    POST
lib/chat-client.ts                        reconnect/backoff/refetch, shared by both UIs
components/chat/ChatPanel.tsx             shared UI, used by teacher tab and /me/chat
components/LocaleSwitcher.tsx
app/error.tsx, app/not-found.tsx, app/(various)/error.tsx as needed
scripts/backup.ts                         nightly pg_dump → GCS
```

---

## Task 1 — Chat schema

Per §4.4.

```
0004_chat.sql
  messages       id · student_id → students · sender(teacher|student)
                 body(text) · created_at

  read_markers   user_id → users · student_id → students · last_read_at
                 PK (user_id, student_id) — one row per side of each thread
```

- `messages.student_id` is the thread key even for the teacher side — there
  is exactly one thread per student (teacher ↔ that student), so no separate
  `conversations` table is needed, matching §4.4's "1:1 text only" design.
- Confirm with Plan 02 Task 11's open question: does deleting a student
  cascade-delete their `messages`? §5.3 says delete "destroys chat history"
  as the stated cost of that action, so yes — `ON DELETE CASCADE` from
  `students` (and transitively nothing needed on `read_markers`, which
  cascades the same way).
- Index `messages(student_id, created_at)` — every read is "this thread,
  ordered by time," and the SSE endpoint's catch-up-since-`Last-Event-ID`
  query needs it too.

## Task 2 — `db/queries/messages.ts`, `db/queries/read_markers.ts`

Per §7.4, row types next to SQL, and the §3.4 cross-student isolation check
applied here too: a student-authenticated call must only ever be able to
read/write the thread tied to their own `student_id`.

`messages.ts`: `listForStudent(studentId, {after?: timestamp})` (the
gap-refetch query), `create(studentId, sender, body)`, `listSince(studentId,
eventId)` for `Last-Event-ID` resumption.

`read_markers.ts`: `get(userId, studentId)`, `upsert(userId, studentId,
timestamp)` (mark-as-read, called when a thread is opened/viewed).

## Task 3 — `domain/chat/unread.ts`

Per §4.4: "Unread count = messages after this timestamp." Pure function
`countUnread(messages: Message[], lastReadAt: DateTime | null): number` —
takes rows already fetched, does the comparison. Keeping this pure (no `db`
call inside it) means Plan 02's Today page and the sidebar badge can both
call it against whatever slice of messages they already have, without a
second round trip per student.

## Task 4 — SSE stream endpoint

Per §7.3 — this closes the transport decision, implemented here for the
first time.

`app/api/chat/[studentId]/stream/route.ts`: `GET` handler returning a
`ReadableStream` with `Content-Type: text/event-stream`. This content type
is load-bearing, not cosmetic — §7.3 confirms Caddy only skips its
buffering and flushes immediately when this header is actually set, so
getting it right here is what makes the §3.1 "no special streaming
configuration" claim true. No Caddy config changes needed as a result; if
messages ever arrive delayed in testing, check this header first before
touching the proxy.

- Auth: reuse Plan 01's session check plus Plan 02's §3.4 ownership check —
  a student may only open the stream for their own `studentId`; the teacher
  may open any.
- On connect: if the request carries a `Last-Event-ID` header, first emit
  every message since that id (via `messages.listSince`) before switching to
  live — this is the "refetch history so no message is missed in the gap"
  behavior §5.4 requires for a dying/reconnecting stream.
- Live delivery: the simplest correct mechanism at this scale (one teacher,
  a handful of students, all in one Node process) is an in-process event
  emitter that the POST handler (Task 5) publishes to and each open stream
  subscribes to — no external pub/sub needed for a single container. Note
  this as a scaling limit (would need a shared bus if the app ever runs
  more than one instance), matching the same single-instance reasoning
  already used for Plan 01's throttle store.
- Each SSE event carries an id (the message's own id works directly) so the
  client's automatic `Last-Event-ID` resumption works without extra
  bookkeeping.

## Task 5 — POST send endpoint

Per §7.3.

`app/api/chat/[studentId]/send/route.ts`: ordinary POST, validates body
with `zod`, same auth/ownership check as Task 4, inserts via
`messages.create`, publishes to Task 4's in-process emitter, returns the
created message (id + timestamp) so the client can reconcile its optimistic
*sending* state (Task 6) against the real row.

## Task 6 — `lib/chat-client.ts` — resilient client

Per §5.4's chat failure-handling row, the most detailed UX requirement in
the spec for this feature.

- Send: optimistic-append the message locally marked *sending*, POST it,
  on success reconcile with the server's returned id/timestamp, on failure
  mark *failed* with a retry action — nothing is silently lost.
- Receive: open the SSE connection (Task 4), reconnect with backoff on
  drop, and on reconnect pass the last-seen message id as `Last-Event-ID` so
  the server-side catch-up (Task 4) fills any gap.
- This lives in `lib/` (not `domain/`) because it's framework-adjacent
  client code (EventSource, fetch) — following Plan 01's precedent that
  `lib/` is where framework glue that isn't a page or a pure function goes.
- Shared verbatim by both the teacher's Chat tab and the student's
  `/me/chat` — same failure modes apply to both sides equally, so one
  implementation, two mounting points.

## Task 7 — `components/chat/ChatPanel.tsx` and wiring

- Shared chat UI component: message list (sender-aligned), composer,
  *sending*/*failed*/retry states from Task 6, unread-clearing on view
  (calls `read_markers.upsert` per Task 2 when the panel mounts/becomes
  visible).
- Wire into Plan 02's stub locations: `app/(teacher)/students/[id]/page.tsx`
  Chat tab, `app/(student)/me/chat/page.tsx`.
- Wire unread badges (Task 3) into Plan 02's sidebar, Today page, and the
  student's Chat tab nav item — these were explicitly stubbed at 0 in Plan
  02 Task 8; replace the stub, don't add a parallel code path.

## Task 8 — Locale switcher

Per §2/§5 (per-user `locale` column, foundation built in Plan 01 Task 10).

`components/LocaleSwitcher.tsx`: small control (teacher shell header,
student page header) that updates the authenticated user's `locale` column
and re-renders in the new language immediately — no page reload required if
`next-intl`'s client-side locale switching supports it cleanly; a full
navigation is an acceptable fallback if not, but prefer the smoother path
first.

## Task 9 — Error handling

Per §5.4's last row: "Database unreachable → generic error page. No stack
traces, no connection strings."

- `app/error.tsx` (and nested `error.tsx` boundaries where a section
  benefits from failing independently, e.g. the chat panel shouldn't take
  down the whole student page if the stream fails to open) — generic
  message, no error detail leaked to the client, real error logged
  server-side only.
- `app/not-found.tsx` for unmatched routes.
- Verify this holds in production mode specifically — Next's dev overlay
  shows stack traces regardless, so the actual test is `next build && next
  start` (or the Docker image) with Postgres stopped, confirming the
  rendered page has no leak.

## Task 10 — Backups

Per §3.1: "nightly pg_dump → Google Cloud Storage bucket, with a lifecycle
retention policy."

- `scripts/backup.ts`, run via `node scripts/backup.ts` (Node 24 direct
  execution, same pattern as Plan 01's seed script) — invoked by a host-level
  cron entry or a scheduled Cloud task hitting the VM, since Compose alone
  has no built-in scheduler; document whichever is chosen in the deploy
  notes rather than adding a fourth container just to run cron.
- `pg_dump` piped/uploaded to the GCS bucket named in `lib/env.ts`; bucket
  lifecycle retention policy is infrastructure (Terraform/gcloud CLI/console),
  not application code — set it once as part of this task, not something
  the script itself enforces.
- **Restore test, promised twice already** (§7.7, and Plan 01 Task 15's
  minimal version): run a full restore from a `scripts/backup.ts` output
  into a scratch Postgres container and confirm the `students`/`class_slots`/
  `messages` data introduced across Plans 02 and 03 all survive — this is
  the complete version of the check Plan 01 only sketched with the seed
  data.

## Task 11 — Full e2e suite

Per §6, all four paths now completable end to end for the first time (paths
1 and 2 were partially exercised in Plan 02 Task 13 without chat in the
picture):

1. Teacher creates a student and receives credentials.
2. That student logs in and is forced to change their password.
3. A message travels teacher → student and student → teacher — drive Task
   4/5/6/7 through the real UI, including a deliberate drop of the SSE
   connection (e.g. via Playwright network interception) to exercise the
   reconnect-and-refetch path from §5.4, not just the happy path.
4. The schedule renders correctly with a cancellation and a move applied
   (already built in Plan 02; re-run here as part of the complete suite so
   CI has one command that proves all four).

## Task 12 — Go-live checklist (§8 gate)

This is the plan's final task and the one the index's "standing constraint"
points at.

- [ ] Domain registered, DNS pointed at the VM's static external IP.
- [ ] `APP_HOSTNAME` (Plan 01's env var) updated from `localhost` to the real
      domain; Caddy reloaded — confirm this really is the one-line change
      §8 promises, and if it isn't, fix whatever made it not be before
      calling this done.
- [ ] Caddy obtains a certificate automatically and serves HTTPS; plain
      HTTP requests redirect to HTTPS.
- [ ] Session cookie's `Secure` flag (Plan 01 Task 8's dev-only relaxation)
      confirmed active in this environment — not still running in the
      relaxed dev mode against a real domain.
- [ ] Nightly backup (Task 10) confirmed running against the production
      database, not a local/dev one, with the GCS bucket and retention
      policy actually attached.
- [ ] Full e2e suite (Task 11) green against the production build.
- [ ] **Only after every box above is checked**, the first real student may
      be onboarded (Plan 02 Task 10). This is the hard gate §8 describes —
      issuing credentials or carrying private notes over plain HTTP is the
      one failure mode this whole plan sequence has been building toward
      preventing.

**Definition of done for the whole plan, and for Phase 1:** all §6 e2e paths
green, backups verified restorable, error pages leak nothing in a
production build, and the go-live checklist is either fully checked or
explicitly blocked on "no domain yet" with every other box already ticked.
