# Jonathan Math — Phase 1 Design

**Status:** design approved. All sections signed off by the platform owner.
Open technical items remain — see §7.
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
│                 proxies to the app. Must be configured to pass through
│                 long-lived streaming responses without buffering.
├─ App            Next.js server: pages, API, and the chat stream
└─ Postgres       data on a named volume
      └─ nightly pg_dump → Google Cloud Storage bucket, with a
         lifecycle retention policy
```

Redeploy is `git pull && docker compose up -d --build`.

**Open item:** the teacher has no domain pointed at the VM yet. Certificates
cannot be issued for a bare IP address, so a domain is required before HTTPS
works. Until then the design runs over plain HTTP for local development only —
students must not use it over HTTP.

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

## 7. Open items

These must be resolved before or during implementation planning.

1. **Stack versions unverified.** Research agents investigating current
   versions and best practice for the realtime transport, password hashing,
   session handling, the i18n library, the ORM choice, recurrence handling, and
   the GCE/Caddy/Postgres deployment specifics were interrupted before
   producing verified findings. Nothing from them is recorded here. Re-run this
   research and confirm actual current versions before committing to
   dependencies.
3. **Transport for chat undecided.** Server-sent events plus POST versus
   WebSocket. Both work on a long-lived Node server; the choice hinges on total
   complexity and is pending the research in item 1.
4. **Application timezone not fixed.** The teacher's timezone needs to be
   confirmed and made a deployment setting.
5. **No domain name yet.** Required for HTTPS. See §3.1.
6. **Rate-limit and lockout thresholds** in §5.4 are unspecified numbers.
7. **Session lifetime and renewal policy** not yet specified.

---

## 8. Next step

Resolve item 1 above (verify current stack versions), then produce an
implementation plan (`superpowers:writing-plans`), then implement.
