# Jonathan Math — Phase 1 Implementation Plans (index)

**Source spec:** [`../specs/2026-08-17-jonathan-math-design.md`](../specs/2026-08-17-jonathan-math-design.md)
**Date:** 2026-08-18

Phase 1 is one application, but it is too large for a single reviewable plan
document. It is split into three plans that run **in order**. Each one ends with
working, testable software — you can stop after any of them and have something
that runs.

| Plan | Contents | Spec sections covered |
|---|---|---|
| [01 — Foundation & Auth](2026-08-18-jonathan-math-01-foundation-auth.md) | Toolchain, Docker, schema and migrations, password hashing, credential generation, sessions, login throttle, i18n, visual foundation, seed script, login, forced password change | §3.1, §3.2, §3.4, §4.1, §5.1 (login/change-password), §5.4 (login rows), §5.5, §7 all, §8 |
| [02 — Students & Schedule](2026-08-18-jonathan-math-02-students-schedule.md) | Student CRUD, teacher admin shell, profile tab, onboarding with one-time credentials, archive/delete, **pure schedule expansion**, conflict detection, schedule UI, student page, Today | §3.3, §3.5, §4.2, §4.3, §5.1 (rest), §5.2, §5.3, §5.4 (schedule rows), §6 (unit + e2e path 4) |
| [03 — Chat & Launch](2026-08-18-jonathan-math-03-chat-launch.md) | Message queries, unread markers, SSE stream, POST send, resilient chat client, unread badges, locale switcher, error pages, backups, full e2e suite, go-live gate | §4.4, §5.1 (chat), §5.4 (chat rows), §6 (e2e paths 1–3), §7.3, §8 |

Run them with `superpowers:subagent-driven-development` or
`superpowers:executing-plans`, one plan at a time, reviewing between plans.

---

## Two places where the plans refine the spec

Both are called out inline in the plans too. Neither changes an approved
decision; each resolves something the spec left implicit.

**1. Layer ordering puts `lib/` above `domain/`.** §3.2 lists four layers and
says each may only call the one below, but it also describes `domain/` as having
"no database access" while §3.5 has `getStudentDashboard` composing two queries.
Those cannot both hold. The resolution used throughout: the call order is
**`app/` → `lib/` → `domain/` → `db/`**. `domain/` may call `db/` (it is the
layer below) but may never import from `next/*`. The "no database access" rule
is preserved exactly where §3.3 actually needs it — `domain/schedule/expand.ts`
imports nothing but Luxon and is enforced by a test. `lib/` holds the framework
glue that needs both `next/*` and domain calls (cookies, guards, i18n).
`lib/env.ts` is a leaf utility importable from any layer, including `db/`.

**2. Two mockup colours are darkened to reach WCAG AA.** The approved warm
academic direction is kept exactly — cream ground, Georgia serif headings, deep
forest green `#1f4d3f`, small-caps labels. But two greys from the mockup fail
contrast at the sizes they are used at: muted text `#7a736c` on `#faf6ee` is
≈4.2:1 and the label grey `#a09890` is ≈2.7:1, both below the 4.5:1 floor for
normal-size text. Plan 01 Task 10 uses `#6b645c` (≈5.1:1) and `#6f675e`
(≈4.9:1) instead. The hues are unchanged; they are the same warm greys, one
step darker. Flag if you would rather keep the mockup values verbatim and accept
the contrast.

## Standing constraint

> **No student may be onboarded until HTTPS is working** (spec §8). All three
> plans run on `localhost`. Plan 03's final task is the go-live checklist that
> gates this.
