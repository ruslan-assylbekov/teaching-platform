# Plan 01 — Foundation & Auth

**Source spec:** [`../specs/2026-08-17-jonathan-math-design.md`](../specs/2026-08-17-jonathan-math-design.md)
**Index:** [`2026-08-18-jonathan-math-phase1-index.md`](2026-08-18-jonathan-math-phase1-index.md)
**Date:** 2026-08-18
**Spec sections:** §3.1, §3.2, §3.4, §4.1, §5.1 (login/change-password), §5.4 (login rows), §5.5, §7 all, §8

## End state

`docker compose up -d --build` on a clean checkout brings up Caddy, the app,
and Postgres on `localhost`. The seed script creates the first teacher
account from environment variables. That teacher can log in, is not forced
through change-password (only newly onboarded students are — see Plan 02),
and a deliberately wrong password is throttled per §5.4. The warm-academic
visual direction renders in light and dark mode. `vitest` runs and passes.
Nothing here touches `students`, `class_slots`, or `messages` — those tables
and everything built on them are Plan 02 and Plan 03.

## Layer ordering used throughout

Per the index: `app/` → `lib/` → `domain/` → `db/`. `domain/` may call `db/`.
`lib/` holds framework glue (`next/*`) plus domain calls — cookies, guards,
i18n. `lib/env.ts` is a leaf, importable from any layer including `db/`.

```
app/(public)/login/page.tsx
app/(auth)/change-password/page.tsx      route group: any authenticated user
lib/session.ts                            cookie issuance/verification
lib/env.ts                                leaf: reads process.env once, typed
lib/i18n.ts                               locale resolution glue
domain/auth/password.ts                   hash/verify
domain/auth/credentials.ts                username + one-time password generation
domain/auth/throttle.ts                   lockout bookkeeping
domain/auth/login.ts                      composes the above
db/queries/users.ts
db/queries/sessions.ts
db/migrations/0001_accounts.sql
```

---

## Task 1 — Repo & toolchain scaffold

Create the Next.js 16 app with the versions locked in spec §7.

- `package.json`: `"type": "module"` (§7.7 — Turbopack fails every `.tsx` file
  without it, and the error names the module format, not the missing field).
  `engines.node = ">=24"`.
- Pin exactly: `next@16.3.1`, `react@19.2.8`, `react-dom@19.2.8`,
  `typescript@5.9.3` (**not** `latest` — that resolves to TS7, the native
  rewrite, per §7.7), `@types/node@24`, `pg@8.23.0`, `node-pg-migrate@9.0.0`,
  `@node-rs/argon2@2.1.0`, `jose@6.2.9`, `luxon@3.7.2`, `next-intl@4.13.6`,
  `zod@4.4.3`, `vitest@4.1.10`, `@playwright/test@1.62.1`.
- `tsconfig.json`: let `next build` rewrite it on first build (it forces
  `"jsx": "react-jsx"`, overriding `"preserve"` — don't fight this). Enable
  `allowImportingTsExtensions` so relative `.ts` specifiers work identically
  under Next, Vitest, and plain `node script.ts` (§7.7).
- `npm install`: expect npm 12 to block `@swc/core` and `@parcel/watcher`
  postinstall scripts with a warning, not an error. **Do not approve those
  scripts** — Next ships prebuilt binaries as optional deps, the build is
  verified green without them, and approving `@parcel/watcher` would pull in
  `node-gyp` and a C++ toolchain, which is exactly what `@node-rs/argon2` was
  chosen to avoid.

**Definition of done:** `npx next build` completes with no CommonJS/ESM error
and no unapproved-script build failure.

## Task 2 — Docker Compose topology

Per §3.1.

- `docker-compose.yml` with three services: `caddy`, `app`, `postgres`.
- `Dockerfile`: `FROM node:24-...` explicitly — do not let this drift to a
  Node 20 base image; nothing in the Next.js version check will warn you
  (§7.1).
- Postgres service: image pinned to `18.6`. **Volume mount is
  `pgdata:/var/lib/postgresql`, no `/data` suffix.** The 18 image sets
  `PGDATA=/var/lib/postgresql/18/docker` and declares `VOLUME
  /var/lib/postgresql`; the traditional `.../data` mount silently attaches to
  a path the server never writes, so the cluster lives in the container's
  writable layer and is destroyed on the next `docker compose down` (§7.7).
  Write a restore-from-backup smoke test before any real student data exists
  — tracked as the last item of Task 13 below, and again as part of Plan 03's
  backup task.
- `caddy` service: bind mount a `Caddyfile`. No streaming-specific config
  needed yet (that lands with the chat endpoint in Plan 03, §7.3) — a plain
  reverse proxy to `app:3000` is enough here. Expose 80/443 only; Postgres
  gets no host port mapping (§3.1 firewall note).
- `.env.example` documenting every variable Task 12's seed script and
  `lib/env.ts` will require: `DATABASE_URL`, `SESSION_SECRET`,
  `DEFAULT_TIMEZONE` (`Asia/Almaty`, §7.6), `TEACHER_SEED_USERNAME`,
  `TEACHER_SEED_PASSWORD`, `APP_HOSTNAME` (defaults to `localhost`, the §8
  one-line switch point for when a domain exists).

**Definition of done:** `docker compose up -d --build` brings up all three
containers; `docker compose exec postgres psql -U ... -c '\conninfo'` shows
data directory under `/var/lib/postgresql/18/docker`.

## Task 3 — `lib/env.ts`

Single leaf module. Reads `process.env` once at import time, validates with
`zod`, throws a descriptive error on boot if anything required is missing
(fail fast, not on first request). Exported as a typed, frozen object.
Importable from `db/` (connection string) and `domain/` (default timezone)
without violating the layer rule, because it imports nothing itself.

## Task 4 — Accounts schema & migrations

Per §4.1. `node-pg-migrate` migration files under `db/migrations/`.

```
0001_accounts.sql
  users     id · username · password_hash · role(teacher|student)
            locale(ru|en) · must_change_password · status(active|archived)
            created_at
  sessions  id · user_id → users · token_hash · expires_at
```

- `role`, `locale`, `status` as Postgres enums or `CHECK` constraints —
  either is fine, but be consistent with how Plan 02's `students.level` and
  Plan 03's `messages.sender` are declared later; pick one convention here
  and note it for reuse.
- `username` unique, case-insensitive (`citext` or a lowercased unique
  index) — login must not be case-sensitive for a young student typing on a
  phone.
- `sessions.token_hash` stores a hash of the session token, never the token
  itself (mirrors `password_hash`) — the cookie holds the raw token, the DB
  row holds only what's needed to verify it.
- Index `sessions(expires_at)` for the sweep job (Task 8).

**Definition of done:** `node-pg-migrate up` runs clean against the Task 2
Postgres container; running it twice is a no-op.

## Task 5 — `db/queries/users.ts`, `db/queries/sessions.ts`

Hand-written SQL per §7.4. Each module declares its row type next to its
SQL. Functions needed by this plan only (more are added in Plan 02/03):

`users.ts`: `findByUsername`, `createTeacher`, `countTeachers` (for the
seed script's refusal check), `setMustChangePassword`, `setPasswordHash`,
`findById`.

`sessions.ts`: `create`, `findByTokenHash`, `deleteByTokenHash`,
`deleteAllForUser` (used on archive/lockout-invalidation in Plan 02, but the
function belongs here with the rest of session storage), `sweepExpired`.

**Definition of done:** integration tests (Task 15) exercise every function
above against the real Postgres container — per §7.4 this *is* the type
check for hand-written SQL, not an optional extra.

## Task 6 — `domain/auth/password.ts`

Argon2id via `@node-rs/argon2` at the exact §7.5 parameters: 19 MiB memory,
2 iterations, parallelism 1, unique per-user salt (library default).

```ts
import { hash, verify } from '@node-rs/argon2'
import type { Algorithm } from '@node-rs/argon2'
const ARGON2ID = 2 as Algorithm
```

Use the type-only import + named numeric constant from §7.7 — the natural
`Algorithm.Argon2id` spelling fails `TS2748` under Next's mandatory
`isolatedModules` because the library declares `Algorithm` as an ambient
`const enum`. Pass `algorithm: ARGON2ID` explicitly even though it's the
library default — §7.7 is explicit that a security parameter shouldn't rest
on a default a minor release could revisit. Verify once, manually, that the
encoded hash reads `$argon2id$v=19$m=19456,t=2,p=1$`.

Export `hashPassword(plain): Promise<string>` and
`verifyPassword(hash, plain): Promise<boolean>`. Pure with respect to the
rest of the app — no DB, no session — so it unit-tests without a database.

## Task 7 — `domain/auth/credentials.ts`

Per §5.2 (generation only — the onboarding *flow* that calls this is Plan
02's; this task just builds the pure generator so Plan 02 can consume it).

- Username: derived from the student's name, lowercased, `first.last` style
  with a numeric suffix on collision (e.g. `aisha.k`, `aisha.k2`) — collision
  check needs `users.findByUsername`, so this function takes the check as an
  injected async predicate rather than importing `db/` directly, keeping it
  testable with a fake.
- One-time password: cryptographically random (`crypto.randomInt` /
  `randomBytes`, not `Math.random`), sufficient entropy to be safe as a
  short-lived shared secret communicated out of band, but still typeable by
  hand — a passphrase-style generator (a few random dictionary words) is
  worth considering over pure random characters, since a teacher will read
  it aloud or write it on paper. Pick one and document the choice; either
  satisfies §5.2's "displayed once, not recoverable" requirement.

**Definition of done:** unit tests cover the collision-suffix path and
verify the generated password meets the chosen entropy floor.

## Task 8 — `lib/session.ts`

Cookie issuance/verification, per §7.5.

- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, value signed with `jose`
  (JWT or JWE — a signed-only JWT is sufficient since the payload is just a
  session id, not secret data; the DB row is the source of truth).
- Lifetimes: student 90 days, teacher 7 days, chosen at issuance based on
  `users.role`.
- Sliding renewal: on each authenticated request, if more than half the
  session's life has elapsed, reissue `expires_at` (both the cookie and the
  `sessions` row) rather than extending on every request.
- `sweepExpired` (Task 5) wired to run periodically — a simple `setInterval`
  in the app process is enough at this scale; no separate cron container.
- Note for local dev: `Secure` cookies require HTTPS. Since §8 keeps
  development on plain `localhost` HTTP, gate the `Secure` flag on
  `NODE_ENV !== 'development'` or equivalent — this is a dev-only relaxation,
  not a change to the production requirement, and must not leak into the
  Docker Compose (production-shaped) config.

## Task 9 — `domain/auth/throttle.ts`

Per §5.4: 5 failed logins per username per 15 min → 15 min lockout; 20
failed logins per IP per 15 min.

**Refinement not fully specified by §4's schema:** the data model in §4.1
has no failed-attempts table, and nothing later adds one. Phase 1 runs a
single app instance (§3.1 — one VM, one container), so an in-memory sliding
window (two `Map`s keyed by username and by IP, values are timestamp
arrays, lazily pruned) is sufficient and avoids adding a table purely for
rate-limit bookkeeping. Cost: a container restart resets counters. Accepted
at this scale — flag if the teacher would rather have this survive restarts,
which would mean a small `login_attempts` table instead.

Export `recordFailure(username, ip)`, `isLocked(username, ip): boolean`,
`recordSuccess(username, ip)` (clears both counters).

## Task 10 — i18n foundation

Per §5 (locale is a per-user `users.locale` column, already in Task 4's
schema).

- `next-intl@4.13.6` configured for the Next 16 App Router.
- `messages/ru.json`, `messages/en.json` — seed with the strings this plan's
  two pages need (login form, generic invalid-credentials error per §5.4,
  change-password form). Plan 02/03 add their own keys as those screens are
  built.
- Locale resolution: read from the authenticated user's `locale` column
  post-login; pre-login (the `/login` page itself) fall back to
  `Accept-Language` or a fixed default — decide and note which, since §5.1
  doesn't specify pre-auth locale behavior. The switcher *component* is
  Plan 03; this task only wires the provider/middleware so it has something
  to switch.

## Task 11 — Visual foundation

Per §2 (visual direction) and the index's contrast correction.

- Design tokens (CSS custom properties or a Tailwind theme config — pick one
  and use it consistently for Plans 02/03 too): cream ground, Georgia (or an
  equivalent serif) for headings, deep forest green `#1f4d3f`, small-caps
  label utility class.
- **Use the corrected greys, not the mockup's:** muted text `#6b645c`
  (≈5.1:1 on `#faf6ee`) and label grey `#6f675e` (≈4.9:1), both ≥4.5:1 for
  normal text per WCAG AA. The mockup's `#7a736c` (≈4.2:1) and `#a09890`
  (≈2.7:1) fail. Flag to the teacher if the mockup's exact values are
  preferred over the contrast fix — the index already surfaced this once;
  this task is where it actually gets built.
- Light and dark mode both built from the same token set (dark is not
  "inverted cream," it needs its own considered palette keeping the same
  green/serif identity).
- Base layout shell used by both `(public)` and `(auth)` route groups: no
  sidebar yet (that's the teacher admin shell in Plan 02) — just centered
  card layouts, since login and change-password are the only screens here.

## Task 12 — Seed script

Per §5.5.

`scripts/seed-teacher.ts`, run as `node scripts/seed-teacher.ts` — Node 24
executes it directly with no build step (§7.7), provided relative imports
use explicit `.ts` extensions.

- Reads `TEACHER_SEED_USERNAME` / `TEACHER_SEED_PASSWORD` from `lib/env.ts`.
- Calls `users.countTeachers()`; **refuses and exits non-zero if any teacher
  row already exists** — this is the whole point of the script (§5.5: "there
  is no way into a fresh deployment" without it, but it must not be
  re-runnable against a live system).
- Hashes the password with Task 6, inserts via `users.createTeacher`,
  `must_change_password = false` for this account (the *seeded* teacher sets
  their own password via the env var they control; forced change is a
  student-onboarding concern from Plan 02).

**Definition of done:** run twice against a fresh DB — first run creates the
teacher, second run exits with a clear "teacher already exists" message and
does not touch the table.

## Task 13 — Login page & flow

Per §5.1, §5.4.

- `app/(public)/login/page.tsx`: username + password form, server action or
  route handler posting to `domain/auth/login.ts`.
- `domain/auth/login.ts` composes: throttle check (Task 9) → `db` lookup
  (Task 5) → `verifyPassword` (Task 6) → on success, issue session (Task 8)
  and clear throttle counters; on failure, record the throttle failure and
  return the **generic** "invalid username or password" error — never
  indicate which field was wrong (§5.4).
- On success: redirect to `/change-password` if `must_change_password` is
  set, else to the role's home (`/` for teacher — Plan 02/03 build the
  actual Today page and student page this redirects to; a placeholder route
  is fine here as long as the redirect target exists).
- Archived-user login attempt: blocked with the §5.4 "contact your teacher"
  message. (No archived students exist yet in this plan, but the check
  belongs in `login.ts` now since Plan 02 won't touch this file again.)

## Task 14 — Change-password page

Per §5.1.

- `app/(auth)/change-password/page.tsx`, guarded so **any** authenticated
  user can reach it regardless of role, and — the other direction — a user
  with `must_change_password = true` can reach **nothing else**. This is the
  first real use of the §3.4 "guard at the route-group boundary" pattern;
  Plan 02 reuses the same mechanism for `(teacher)` / `(student)`.
- On submit: verify current password (defense against a stolen cookie),
  hash and store the new one, clear `must_change_password`, keep the
  existing session valid (don't force a re-login after a forced
  password change — that would be a confusing loop).

## Task 15 — Tests

Per §6 (unit ownership starts here even though schedule expansion, the
section's main subject, is Plan 02).

- `vitest` unit tests: `domain/auth/password.ts` (hash/verify round-trip,
  wrong password rejected), `domain/auth/credentials.ts` (collision suffix,
  entropy floor), `domain/auth/throttle.ts` (5-per-15-min lockout, 20-per-IP,
  window expiry).
- Integration tests against the real Postgres container (§7.4): every
  function in `db/queries/users.ts` and `db/queries/sessions.ts`, run
  through `node-pg-migrate` first so the schema under test matches Task 4
  exactly.
- Manual/scripted check: restore the Task 2 Postgres volume from a
  `pg_dump` taken after Task 12's seed, following a `docker compose down` +
  `up`, and confirm the teacher row survives — the concrete test §7.7 asks
  for before real data exists. A minimal version is enough here; the full
  nightly-backup mechanism is built in Plan 03.

**Definition of done for the whole plan:** all of the above green, plus a
manual pass — fresh `docker compose up -d --build`, run the seed script,
log in as the seeded teacher, deliberately fail the password 5 times and
see the lockout, wait or reset, log in correctly, land on `/change-password`
only if forced (it shouldn't be, for the seeded account), toggle
light/dark and confirm the palette holds contrast.
