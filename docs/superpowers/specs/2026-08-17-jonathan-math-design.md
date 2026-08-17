# Jonathan Math — Phase 1 Design

**Status:** design approved and fully specified. All decisions signed off by the
platform owner. Stack versions verified 2026-08-17 — see §7; build-level
behaviour verified by building the stack — see §7.7, which also **corrects a
false claim about Luxon** in §7.2. Nothing blocking; HTTPS is gated on a
domain — see §8.
**Date:** 2026-08-17
**Author:** design session with the platform owner (teacher).

---

## 1. Purpose

A private teaching platform for a solo maths tutor and their students. The teacher
manages student records and class schedules; each student gets a personal page
showing their objectives and upcoming classes, plus a direct chat with the teacher.

Automatic homework marking is explicitly **out of scope for Phase 1** and is
specified separately as Phase 2.

### Phase split

| Phase | Contents | Status |
|---|---|---|
| 1 | Auth, teacher admin + student CRUD, student personal page, schedule, chat | this document |
| 2 | Homework: tests and open questions, automatic correctness checking | separate spec, not started |

The Phase 1 data model is designed so Phase 2 is purely additive — see §4.5.

---

## 2. Decisions made

Each of these was chosen deliberately during the design session. The rationale
matters as much as the choice, because these are the points where a future
maintainer would otherwise be tempted to "fix" something that is correct.

| Decision | Choice | Why |
|---|---|---|
| Hosting | Single Google Compute Engine VM, Docker Compose | Teacher already has the VM. Cheapest at this scale, no vendor lock-in. Serverless was rejected because it cannot hold the long-lived connection chat wants. |
| Architecture | One Next.js app serving both UI and API | Solo maintainer. One repo, one build, one deploy. A split SPA + API was rejected as more surface area than it earns at this scale. |
| Student login | Teacher-issued username + one-time password | Students may be young and lack reliable email. No email service, no SMS costs. Teacher can always reissue. |
| Schedule | Recurring weekly slot per student + sparse per-occurrence overrides | Matches how tutoring actually runs. Avoids re-entering the same slots weekly. |
| Chat | 1:1 text only, live, with unread indicators | Deliberately no attachments — the teacher chose text-only. |
| Objectives | Single free-text field | Chosen over a structured checklist. Less to build, and the teacher writes prose anyway. |
| Languages | Russian + English, switchable per user | Students and parents may prefer either. Stored as a per-user setting. |
| Teacher admin layout | Persistent student sidebar + detail pane, with **Today** pinned above the student list | Teacher chose the sidebar for instant student switching; Today was added to preserve the "what's happening today?" answer the sidebar layout otherwise loses. |
| Student page layout | Single column, chat on its own tab with unread badge | Students are phone-first. The only option that does not compromise on a small screen. |
| Visual direction | Warm academic — cream ground, serif headings, deep forest green, small-caps labels | Signals serious teaching rather than generic dashboard. Light and dark modes both built. |

### Deliberately excluded from Phase 1

No attachments or file uploads. No structured objectives table. No notifications
(email, SMS, push). No audit log. No separate parents table or parent login. No
multi-teacher support. Each is straightforward to add later; none is needed now.

---

## 3. Architecture

### 3.1 Deployment topology

Three containers on one VM, defined in a single `docker-compose.yml`:

```
Google Compute Engine VM (static external IP)
│
├─ Caddy          terminates HTTPS, automatic certificate management,
│                 proxies to the app. Needs no special streaming
│                 configuration — see §7.3.
├─ App            Next.js server: pages, API, and the chat stream
└─ Postgres       data on a named volume
      └─ nightly pg_dump → Google Cloud Storage bucket, with a
         lifecycle retention policy
```

Redeploy is `git pull && docker compose up -d --build`.

**Domain:** none registered yet, so HTTPS is not yet possible and development
runs on `localhost`. See §8 for the constraint this places on going live.

**Firewall:** expose 80 and 443 only. Postgres must not be reachable from
outside the VM.

### 3.2 Internal layering

Four layers. **Each layer may only call the layer below it.**

```
app/     Routes and pages. Thin. Reads the session, calls domain, renders.
         No SQL. No business rules.
domain/  Pure business logic. No framework imports, no database access.
         students · schedule · chat · auth
db/      Schema, migrations, one query module per entity.
         The only place SQL lives.
lib/     Session cookies, i18n, formatting. Framework glue.
```

The strictness exists mainly to protect one module. See §3.3.

### 3.3 Schedule expansion is a pure function

Turning a recurring pattern plus a set of overrides into a concrete list of
dated class occurrences is the only genuinely tricky logic in Phase 1, and it is
where timezone and daylight-saving bugs live.

Therefore `domain/schedule` exposes a **pure function**: given a slot
definition, a list of overrides, and a date range, it returns occurrences. It
reads no database, no clock, and no framework context. Every DST and edge case
is unit-testable without starting a server or seeding a database.

This is the single most important structural decision in the design. Do not
allow database access to leak into this module.

### 3.4 Roles and access control

Two roles — `teacher` and `student` — distinguished by a column on one `users`
table. A student is a `students` profile row linked to a `users` row, so
disabling a login never destroys teaching history.

Access control is enforced in **two places, deliberately redundantly**:

1. Route-group layouts (`(teacher)` and `(student)`) guard at the boundary, so
   an unauthenticated or wrong-role request never reaches a page.
2. Every query function touching student-scoped data re-checks that the caller
   owns that data.

The duplication is the point: a future routing mistake must not become a data
leak where one student can read another's chat or profile.

### 3.5 Request flow example

Student opens their page:

```
cookie → session lookup → layout confirms role is `student`
      → page calls getStudentDashboard(studentId)
      → composes profile query + schedule query, runs occurrence expansion,
        returns a plain object
      → page renders
      → chat panel opens a stream for live messages
```

---

## 4. Data model

Seven tables. Everything hangs off `users`.

### 4.1 Accounts

```
users            id · username · password_hash · role(teacher|student)
                 locale(ru|en) · must_change_password
                 status(active|archived) · created_at

sessions         id · user_id · token_hash · expires_at
                 Login sessions. Deleted on logout, swept when expired.
```

### 4.2 Students

```
students         user_id → users        one row per student
                 full_name · grade · school(optional) · level
                 objectives(text, optional)
                 private_notes(text, optional)     teacher-only, never sent to the student
                 parent_phone · parent_name(optional)   teacher-only
                 started_at
```

`private_notes`, `parent_phone` and `parent_name` must never be included in any
payload reaching a student client.

### 4.3 Schedule

```
class_slots      student_id · weekday(0-6) · start_time(local wall-clock)
                 duration_minutes · timezone
                 active_from · active_until(optional)
                 The recurring pattern. A student may have several.

class_overrides  slot_id · original_date
                 action(cancelled|moved)
                 new_date(optional) · new_start_time(optional) · note(optional)
                 One row per deviation. Absence of a row means the pattern holds.
```

**Times are stored as local wall-clock plus a timezone identifier, not as UTC.**
This looks wrong and is intentional. "Every Tuesday at 17:00" means 17:00 local,
including after a clock change. Storing a fixed UTC instant makes the class
silently drift by an hour at each daylight-saving transition. Recurring events
are the specific case where UTC-only storage is incorrect. Individual
occurrences are resolved to real instants at display time.

**Overrides are sparse.** Cancelling one class writes one row. It never rewrites
the pattern and never backfills a table of future sessions. Past classes
therefore remain whatever the pattern said at the time.

### 4.4 Chat

```
messages         id · student_id · sender(teacher|student) · body · created_at

read_markers     user_id · student_id · last_read_at
                 Unread count = messages after this timestamp.
                 One row per side of each conversation.
```

Unread state is one timestamp per participant, not a flag per message. With two
participants and text-only messages, per-message read tracking earns nothing.

### 4.5 Phase 2 hook

Homework will add `assignments`, `questions`, `submissions` and `answers`, all
linked to `students.user_id`. No table above needs to change.

---

## 5. Screens and flows

### 5.1 Routes

| Route | Role | Contents |
|---|---|---|
| `/login` | public | Username and password |
| `/change-password` | any | Forced on first login; blocks all other routes until done |
| `/` | teacher | Today: today's classes, unread messages |
| `/students` | teacher | Sidebar directory + detail pane |
| `/students/[id]` | teacher | Tabs: Profile · Schedule · Chat |
| `/students/new` | teacher | Create student, then show generated credentials once |
| `/me` | student | Next class, upcoming classes, objectives |
| `/me/chat` | student | Chat thread with the teacher |

### 5.2 Onboarding a student

1. Teacher fills in the student form.
2. Platform generates a username (e.g. `aisha.k`) and a random one-time password.
3. Both are displayed **once** on a confirmation screen, copyable.
4. Teacher passes them to the student out of band.
5. Student's first login forces a password change.

The temporary password is not recoverable — the teacher reissues instead. Until
the password is changed the account can reach nothing but `/change-password`.

### 5.3 Removing a student

**Archive is the default:** hidden from the active list, login disabled, all
history retained. True deletion is a separate, deliberate action behind a typed
confirmation, because it destroys chat history and schedule records.

### 5.4 Failure handling

| Situation | Behaviour |
|---|---|
| Wrong password | Generic "invalid username or password" — never reveals which field was wrong. Rate-limited per IP and per username, with lockout after repeated failures. |
| Connection drops mid-send | Message stays visible marked *sending*, retries automatically, becomes *failed* with a retry action if it cannot get through. Nothing is silently lost. |
| Chat stream dies | Reconnects with backoff, then refetches history so no message is missed in the gap. |
| Two overlapping class slots | Rejected at save, naming the conflicting slot. |
| Cancelling a class already in the past | Allowed but flagged — may be a record correction. |
| Daylight-saving transition | Occurrence expansion resolves wall-clock time in the stored timezone, so 17:00 stays 17:00. Explicitly unit-tested. |
| Archived student attempts login | Blocked with "contact your teacher"; existing sessions invalidated immediately. |
| Database unreachable | Generic error page. No stack traces, no connection strings. |

### 5.5 Initial teacher account

A one-time seed script reads credentials from environment variables and creates
the first teacher account, refusing to run if a teacher already exists. Without
this there is no way into a fresh deployment. This was not requested but is
required.

---

## 6. Testing strategy

**Unit** — owns schedule expansion. Daylight-saving transitions in both
directions, overrides landing on already-cancelled dates, patterns ending
mid-week, occurrences affected by a slot edited after the fact. Cheap to run
because the logic is a pure function.

**Integration** — query modules against a real Postgres in a container.
Includes the cross-student isolation checks from §3.4.

**End-to-end (browser)** — four paths:
1. Teacher creates a student and receives credentials.
2. That student logs in and is forced to change their password.
3. A message travels teacher → student and student → teacher.
4. The schedule renders correctly with a cancellation and a move applied.

---

## 7. Stack — verified 2026-08-17

Every version below was checked against the npm registry, nodejs.org,
postgresql.org, or the project's own release page on the date shown. This
replaces the unverified research that was interrupted in the design session.

| Piece | Version | Notes |
|---|---|---|
| Node.js | **24.19.0 LTS** ("Krypton") | Active LTS. See the warning below. |
| Next.js | 16.3.1 | Requires Node ≥20.9. Peer React 18.2+ or 19. |
| React | 19.2.8 | |
| PostgreSQL | **18.6** | Newest stable, supported to Nov 2030. 19 is in beta — not for this. |
| `pg` driver | 8.23.0 | No ORM — see §7.4. |
| `node-pg-migrate` | 9.0.0 | Plain-SQL migrations. |
| `@node-rs/argon2` | 2.1.0 | Prebuilt native binaries, so no `node-gyp` in the Docker build. |
| `jose` | 6.2.9 | Session token signing. |
| `luxon` | 3.7.2 | Timezone maths. See §7.2 and §7.6. |
| `next-intl` | 4.13.6 | Peer range includes `^16.0.0`, so it is Next 16 ready. |
| `zod` | 4.4.3 | Input validation at the route boundary. |
| `vitest` | 4.1.10 | Unit tests, per §6. Engines allow Node 24. |
| `@playwright/test` | 1.62.1 | The four browser paths in §6. |
| TypeScript | **5.9.3** | Pin the 5.x line. See §7.7. |
| npm | 12.0.2 | Blocks install scripts by default. See §7.7. |
| Caddy | 2.11.4 | See §7.3. |

### 7.1 Node 20 is end-of-life — use Node 24

**Node.js 20 reached end-of-life on 2026-03-24** and Node 22 is now in
maintenance only. Next.js 16 still merely *permits* Node ≥20.9, so nothing will
warn you: a `FROM node:20` base image builds and runs perfectly while receiving
no security patches. Pin the Docker base image to **Node 24** and treat the
`engines` field as load-bearing.

### 7.2 Temporal is not available — use Luxon

The `Temporal` API would be the natural fit for §3.3's wall-clock-plus-zone
arithmetic, and it is tempting because it is in every recent JavaScript article.
It is not usable: MDN lists it as *limited availability* and still a TC39
proposal rather than shipped ECMAScript, and `typeof Temporal` evaluates to
`undefined` on Node 24.18 with no flag available to change that.

**Luxon 3.7.2** is therefore the choice, and it suits the design well:
`DateTime.fromObject({...}, { zone })` resolves a wall-clock time in a named
IANA zone directly, which is exactly the operation §4.3 requires. Verified on
Node 24.18 with Luxon 3.7.2: `17:00` in `Europe/London` resolves to
`+00:00` in January and `+01:00` in July, so the wall-clock guarantee §4.3
depends on genuinely holds.

**Correction (verified 2026-08-17): Luxon does *not* flag times that do not
exist in a zone.** An earlier draft of this section claimed `.isValid` /
`invalidReason` report the 01:30 skipped on a spring-forward morning. They do
not. `DateTime.fromObject({year: 2026, month: 3, day: 29, hour: 1, minute: 30},
{ zone: 'Europe/London' })` returns `isValid === true`, `invalidReason === null`,
and a time silently shifted forward to `02:30+01:00`. Nonexistent local times
are therefore **silently wrong by default** — the exact failure mode this
section claimed was covered.

Detect the gap by round-tripping the wall-clock fields instead: if
`dt.hour !== requested.hour || dt.minute !== requested.minute`, the requested
time did not exist in that zone. The occurrence expansion of §3.3 must apply
this check and decide explicitly, rather than trusting `.isValid`.

Ambiguous times — the 01:30 that happens twice on an autumn fall-back morning —
also return `isValid === true`, resolving to the **earlier** offset (`+01:00`
on `2026-10-25`). That is a defensible default, but it is a default, not a
detection. Both cases are required test material for §6.

Revisit Temporal only once it is Baseline and unflagged in an LTS Node.

### 7.3 Chat transport: server-sent events plus POST — decided

This closes the open item. **SSE for the server→client stream, ordinary POST
for client→server sends.**

- Next.js Route Handlers stream natively by returning a `ReadableStream`, and
  this is documented and supported. **WebSocket is not mentioned anywhere in
  the Route Handler API reference** — it has no first-class support, so it would
  require a custom server, giving up `next start` and complicating the container.
  That is a large structural cost for a solo maintainer.
- Caddy needs **no configuration at all** for this: it flushes immediately and
  ignores its own buffering settings whenever the response carries
  `Content-Type: text/event-stream`. The §3.1 note about configuring
  pass-through is therefore satisfied for free — but only if the endpoint really
  does set that content type.
- SSE reconnects on its own, which §5.4 already requires, and the
  `Last-Event-ID` header gives the "refetch history so no message is missed in
  the gap" behaviour a natural implementation.
- The traffic is asymmetric and tiny: one teacher, 1:1 text threads. WebSocket's
  bidirectional frames would buy nothing here.

### 7.4 Data access: hand-written SQL on `pg` — decided

No ORM. Queries are hand-written SQL in `db/queries/`, one module per entity;
migrations are plain `.sql` files run by `node-pg-migrate` 9.0.0.

This follows from §3.2, which already confines SQL to `db/` with one query
module per entity — the discipline an ORM would enforce is structural here
rather than borrowed from a library. Seven tables, a static schema, and no
complex query needs make the trade worthwhile, and it sidesteps the version
problem entirely: Drizzle's stable line is dormant, its successor is a release
candidate, and Prisma would add a codegen step to the container build.

**The accepted cost is that row types are hand-written and can drift from the
schema.** Mitigate deliberately: every query module declares an explicit row
type next to its SQL, and the integration tests of §6 run against a real
Postgres, so a column rename that breaks a query fails a test rather than
surfacing in production. Do not skip the integration test for a query module on
the grounds that it is "just a select" — that test *is* the type check.

### 7.5 Security parameters — decided

Argon2id per OWASP, which deprecates bcrypt to legacy-only status:
**19 MiB memory, 2 iterations, parallelism 1**, unique per-user salt. Tune
upward if a hash takes well under one second on the VM.

Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, signed with `jose`.

| Setting | Value |
|---|---|
| Student session lifetime | 90 days |
| Teacher session lifetime | 7 days |
| Renewal | Sliding — extended when a session is used past half its life |
| Lockout | 5 failed logins per username per 15 min → 15 min lockout |
| IP throttle | 20 failed logins per IP per 15 min |

Students get the long session because a locked-out young student cannot
self-serve a reset — every lockout becomes a message to the teacher. The
teacher session is short because that account can reach every student's data.

### 7.6 Timezone: `Asia/Almaty`

UTC+5, the deployment default for new slots, set via environment variable.

**`Asia/Almaty` has no daylight-saving transitions**, so the DST tests §6
requires cannot be written against it. They are still required: `class_slots`
carries a per-slot `timezone` (§4.3), so a student abroad or a future move
brings DST into scope, and the expansion function must be correct before that
happens rather than after. Write those cases against **`Europe/London`** as a
fixture zone — spring-forward gap and autumn ambiguity both — and treat the
zone as a parameter throughout, never as a constant.

### 7.7 Build-level findings — verified by building the stack 2026-08-17

The versions in §7 were checked against registries. The findings below come from
actually installing the stack and running `next build` to completion on Node
24.18.0 with npm 12.0.2 — except the last, which comes from reading the official
Postgres image Dockerfiles. Each one silently breaks a build, a security
parameter, or the durability of the database, and none is discoverable from a
version number.

**`package.json` must set `"type": "module"`.** Without it Turbopack fails the
build outright with *"Specified module format (CommonJs) is not matching the
module format of the source code (EcmaScript Modules)"* on every `.tsx` file.
The error names the module format, not the missing field, so it reads like a
transform misconfiguration. With the field set, the same source compiles in
~0.5s.

**`Algorithm.Argon2id` cannot be referenced.** `@node-rs/argon2` declares
`Algorithm` as an ambient `const enum`, and Next.js mandates
`isolatedModules`, so the natural spelling fails type checking with
*TS2748: Cannot access ambient const enums when 'isolatedModules' is enabled*.
Use a type-only import and a named numeric constant, which type-checks clean:

```ts
import type { Algorithm } from '@node-rs/argon2'
const ARGON2ID = 2 as Algorithm
```

Verified that this produces genuine Argon2id at the §7.5 parameters — the
encoded hash reads `$argon2id$v=19$m=19456,t=2,p=1$`. Omitting `algorithm`
entirely also yields argon2id, since it is the library default, but write it
explicitly: a security parameter should not rest on a default that a minor
release could revisit.

**npm 12 blocks dependency install scripts by default.** `@swc/core`
(postinstall) and `@parcel/watcher` (`node-gyp rebuild`) are both blocked with a
warning, not an error. This is a security improvement worth keeping, and it is
**verified not to break the build** — `next build` completes green with both
blocked, because Next ships prebuilt platform binaries as optional
dependencies. Do not "fix" the warning by approving scripts in the Dockerfile;
approving `@parcel/watcher` in particular would pull `node-gyp` and a C++
toolchain into the image, which is exactly what choosing `@node-rs/argon2`
(§7) was meant to avoid.

**TypeScript's `latest` tag is 7.0.2 — do not take it.** TypeScript 7 is the
native compiler rewrite; `npm i -D typescript` silently installs it, and
likewise `@types/node` resolves to 26.x, which describes a Node runtime two
majors ahead of the pinned one. Pin `typescript@5.9.3` and `@types/node@24`,
both verified against this stack. Note also that Next rewrites `tsconfig.json`
on first build and *mandates* `"jsx": "react-jsx"`, overriding `"preserve"`.

**Node 24 executes TypeScript directly.** `node script.ts` runs with no loader,
flag, or build step, provided relative imports carry explicit `.ts`
extensions. The seed script of §5.5 and any operational scripts therefore need
no separate compile step. Verified further: relative `.ts` specifiers also
resolve under `next build` (with `allowImportingTsExtensions`) and under Vitest,
so one import style works everywhere and no path alias is needed.

**Postgres 18 moved its data directory — the usual volume mount silently loses
all data.** Every Postgres Compose example in circulation mounts
`pgdata:/var/lib/postgresql/data`, which was correct through Postgres 17. In
18 the official image sets `PGDATA=/var/lib/postgresql/18/docker` and declares
`VOLUME /var/lib/postgresql` (verified in the `docker-library/postgres`
Dockerfiles for both the bookworm and alpine variants). Mounting the old path
therefore attaches the named volume to a directory the server does not write to:
the cluster lands in the container's writable layer, works perfectly, and is
destroyed by the next `docker compose down`. The §3.1 backup story would be
backing up a database that cannot survive a redeploy.

**Mount `pgdata:/var/lib/postgresql`** — no `/data` suffix. This is worth an
explicit restore test before any student data exists.

---

## 8. Open constraint: no domain, therefore no HTTPS

No domain is registered yet. Certificates cannot be issued for a bare IP, so
development and testing run on `localhost` and the hostname stays an
environment variable, making the switch a one-line change plus a Caddy reload.

> **No student may be onboarded until HTTPS is working.** Phase 1 issues
> passwords over the wire and carries a teacher's private notes on children.
> Plain HTTP exposes both. This is a hard gate on going live, not a to-do.

---

## 9. Next step

Design and stack are settled; nothing is blocking. Produce an implementation
plan (`superpowers:writing-plans`), then implement.
