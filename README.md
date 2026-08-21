# Jonathan Math

A private teaching platform for a solo maths tutor and their students. The
teacher manages student records and class schedules; each student gets a
personal page showing their objectives and upcoming classes, plus a direct
chat with the teacher.

Design spec: [`docs/superpowers/specs/2026-08-17-jonathan-math-design.md`](docs/superpowers/specs/2026-08-17-jonathan-math-design.md)
Implementation plans: [`docs/superpowers/plans/`](docs/superpowers/plans/)
Go-live checklist: [`docs/go-live-checklist.md`](docs/go-live-checklist.md)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL 18, no ORM ·
`node-pg-migrate` · Argon2id (`@node-rs/argon2`) · `jose` sessions ·
`next-intl` (RU/EN) · Luxon · Docker Compose behind Caddy · Vitest ·
Playwright. Exact pinned versions and the reasoning behind each are in the
design spec's §7.

## Architecture

Four layers, each calling only the one below it:

```
app/     Routes, pages, API routes. Thin — reads the session, calls
         domain/, renders. No SQL, no business rules.
lib/     Framework glue: session cookies, i18n, the chat event bus.
         Needs next/* and may call domain/.
domain/  Business logic. No framework imports. May call db/.
db/      Schema, migrations, one query module per entity. The only
         place SQL lives.
```

`domain/schedule/expand.ts` is the one module that imports nothing but
Luxon — recurring-schedule expansion (including DST handling) is pure and
independently unit-tested. See the design spec §3.3 and the plan index for
why this boundary is enforced strictly.

## Running it locally

```
cp .env.example .env        # fill in SESSION_SECRET, POSTGRES_PASSWORD, etc.
docker compose up -d --build
docker compose run --rm tools npm run migrate -- up
docker compose run --rm tools npm run seed:teacher
```

Then open `http://localhost` and log in with the `TEACHER_SEED_USERNAME` /
`TEACHER_SEED_PASSWORD` from `.env`.

Postgres has no host port mapping (§3.1's firewall requirement even in dev)
— everything that needs the database, including migrations and the seed
script, runs through the `tools` Compose service, which is profile-gated so
it never starts with a plain `docker compose up`:

```
docker compose run --rm tools <command>
```

Rebuild after pulling changes: `docker compose up -d --build`.

## Tests

```
npm test                 # unit — pure functions, no DB (fast, no Docker needed)
npm run test:integration # via the tools service — needs Postgres running
npx playwright test      # e2e — needs the full stack up on localhost
```

`npm run test:integration` must run inside the `tools` container (same
reason as migrations — no host port on Postgres):

```
docker compose run --rm tools npm run test:integration
```

The Playwright suite (`e2e/full-journey.spec.ts`) drives all four `§6` user
journeys against a running `docker compose` stack: it logs in as the seeded
teacher, creates a real throwaway student, and cleans up after itself only
if you do — delete stray `E2E Student ...` accounts afterward if you care
about a clean database.

## Project layout

```
app/(public)/login              unauthenticated
app/(auth)/change-password      any authenticated user, forced on first login
app/(teacher)/...               role=teacher: Today, students, schedule, chat
app/(student)/...               role=student: /me, /me/chat
app/api/chat/[studentId]/...    SSE stream + POST send
db/migrations/                  plain SQL, run via node-pg-migrate
db/queries/                     hand-written SQL, one module per entity
domain/auth, students, schedule, chat, account
lib/                            session, i18n, chat transport, env validation
components/                     shared client components (chat, locale switcher)
e2e/                            Playwright suite
```

## Deploying

Single VM, Docker Compose, Caddy for TLS — see the design spec §3.1 and
[`docs/go-live-checklist.md`](docs/go-live-checklist.md) for the exact
gate before any real student is onboarded. Redeploy is
`git pull && docker compose up -d --build`.
