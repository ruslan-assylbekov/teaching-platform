# Go-live checklist

**Source spec:** [`superpowers/specs/2026-08-17-jonathan-math-design.md`](superpowers/specs/2026-08-17-jonathan-math-design.md) §8
**Source plan:** [`superpowers/plans/2026-08-18-jonathan-math-03-chat-launch.md`](superpowers/plans/2026-08-18-jonathan-math-03-chat-launch.md) Task 12

> **No student may be onboarded until every box below is checked.** Phase 1
> issues passwords over the wire and carries a teacher's private notes on
> children. Plain HTTP exposes both. This is a hard gate, not a to-do.

Check these off in order, on the actual production VM, not a dev machine.

- [ ] **Domain registered, DNS pointed at the VM's static external IP.**

- [ ] **`APP_HOSTNAME` updated and Caddy reloaded.**
      Edit `.env` on the VM: change `APP_HOSTNAME=http://localhost` to the
      bare domain with no scheme, e.g. `APP_HOSTNAME=math.example.com`.
      Then `docker compose up -d` (Caddy picks up the new value from its
      env file; no image rebuild needed). Confirm this really was the
      one-line change §8 promised — if it wasn't, something regressed and
      needs fixing before continuing.

- [ ] **Caddy serves HTTPS automatically.**
      Caddy obtains a certificate for the new domain on first request (no
      manual cert steps). Confirm: `curl -I https://<domain>/login` returns
      `200`, and `curl -I http://<domain>/login` redirects to `https://`.

- [ ] **Session cookie's `Secure` flag is actually active.**
      `lib/session.ts` derives this from whether `APP_HOSTNAME` starts with
      `http://` (not from `NODE_ENV` — that was a real bug caught during
      Plan 01 testing: Docker's `next start` sets `NODE_ENV=production`
      regardless of whether HTTPS is actually being served). Confirm: log
      in over `https://<domain>` and inspect the `Set-Cookie` header —
      it must include `Secure`. If it doesn't, `APP_HOSTNAME` wasn't
      updated correctly (previous box).

- [ ] **Nightly backup running against the production database.**
      `scripts/backup.ts` needs `GCS_BUCKET` set in `.env` and a GCS bucket
      that exists, with a lifecycle retention policy attached (bucket
      config, not application code — set via `gcloud`/Terraform/console,
      once). Authenticates via the VM's attached service account
      (Application Default Credentials) — no key file to manage. Schedule
      it with a host-level cron entry (Compose has no built-in scheduler):
      ```
      0 3 * * * cd /path/to/app && docker compose run --rm tools npm run backup >> /var/log/jonathan-math-backup.log 2>&1
      ```
      Confirm: trigger it manually once, check the log for
      `Backup uploaded to gs://...`, and confirm the object actually
      appears in the bucket.

- [ ] **A restore has actually been tested against this exact backup
      mechanism**, not just during development. (Development already
      verified the dump/restore round-trip is valid — students,
      class_slots, and messages all survive — but that was against a dev
      database, not a real GCS object downloaded back down. Do the full
      loop once: download a real nightly backup object, `gunzip`, restore
      into a scratch Postgres, confirm the data.)

- [ ] **Full e2e suite green against the production build.**
      ```
      npx playwright test
      ```
      Point `E2E_BASE_URL` at the production URL if running from off-VM,
      or run it against `http://localhost` from the VM itself. Needs
      `TEACHER_SEED_USERNAME` / `TEACHER_SEED_PASSWORD` in the environment
      matching the actual seeded account — the suite logs in with those and
      creates/deletes its own throwaway student, so don't run it against
      data you care about without expecting a stray `E2E Student ...`
      account to appear (clean it up after, same as in development).

- [ ] **Only after every box above is checked**, onboard the first real
      student (`/students/new`).

## If something looks wrong

- **Cookie not `Secure` over HTTPS** — `APP_HOSTNAME` still says
  `http://...`. Fix it, `docker compose up -d`, log out and back in (an
  already-issued cookie won't retroactively gain the flag).
- **Caddy not getting a certificate** — check DNS actually resolves to the
  VM (`dig <domain>`) and that port 80/443 are reachable from the internet
  (design spec §3.1's firewall only opens those two).
- **Backup script fails with a GCS auth error** — the VM's service account
  needs `roles/storage.objectCreator` (or broader) on the bucket; this is
  an IAM grant, not something `scripts/backup.ts` can fix by retrying.
