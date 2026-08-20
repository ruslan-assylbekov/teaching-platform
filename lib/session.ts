import { createHash, randomBytes } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { env } from './env.ts'
import * as sessionsDb from '../db/queries/sessions.ts'
import * as usersDb from '../db/queries/users.ts'
import type { UserRow } from '../db/queries/users.ts'

const COOKIE_NAME = 'session'
const secretKey = new TextEncoder().encode(env.SESSION_SECRET)

// Design spec §7.5.
const SESSION_LIFETIME_MS: Record<UserRow['role'], number> = {
  teacher: 7 * 24 * 60 * 60 * 1000,
  student: 90 * 24 * 60 * 60 * 1000,
}

// The cookie holds a raw random token, signed into a JWT so it can't be
// tampered with in transit; the DB stores only a hash of that token,
// mirroring password_hash, so a DB dump alone yields no usable session
// (design spec §4.1). A plain signed JWT (not JWE) is enough because the
// token doesn't need to stay confidential from the browser holding it —
// only unforgeable (design spec §7.5).
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function isSecureCookie(): boolean {
  // `Secure` cookies require HTTPS, or a real browser silently refuses to
  // send the cookie back at all — gating this on NODE_ENV was wrong: the
  // Docker Compose deployment runs `next start` (NODE_ENV=production) while
  // still serving plain HTTP on localhost until a domain exists (design
  // spec §8), which would have marked the cookie Secure over an insecure
  // connection and broken login in any real browser. APP_HOSTNAME's scheme
  // is the actual signal for what's being served — see Plan 03's go-live
  // checklist, which re-verifies this before any student is onboarded.
  return !env.APP_HOSTNAME.startsWith('http://')
}

async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jwt = await new SignJWT({ token })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey)

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })
}

export async function createSession(user: UserRow): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const lifetimeMs = SESSION_LIFETIME_MS[user.role]
  const expiresAt = new Date(Date.now() + lifetimeMs)

  await sessionsDb.create({ userId: user.id, tokenHash: hashToken(token), expiresAt })
  await setSessionCookie(token, expiresAt)
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const jwt = cookieStore.get(COOKIE_NAME)?.value
  if (jwt) {
    try {
      const { payload } = await jwtVerify(jwt, secretKey)
      if (typeof payload.token === 'string') {
        await sessionsDb.deleteByTokenHash(hashToken(payload.token))
      }
    } catch {
      // Invalid or already-expired cookie — nothing to delete server-side.
    }
  }
  cookieStore.delete(COOKIE_NAME)
}

// Sliding renewal: reissue once more than half the session's life has
// elapsed, rather than extending on every request (design spec §7.5).
async function maybeRenew(session: sessionsDb.SessionRow, user: UserRow, token: string): Promise<void> {
  const lifetimeMs = SESSION_LIFETIME_MS[user.role]
  const issuedAtMs = session.expires_at.getTime() - lifetimeMs
  const elapsedMs = Date.now() - issuedAtMs
  if (elapsedMs > lifetimeMs / 2) {
    const newExpiresAt = new Date(Date.now() + lifetimeMs)
    await sessionsDb.updateExpiry(session.id, newExpiresAt)
    await setSessionCookie(token, newExpiresAt)
  }
}

// Memoized per request (React's cache()): every route-group layout and
// lib/i18n.ts's locale resolution calls this independently, and without
// memoization each of those would be its own DB round trip within the same
// render pass. Does not cover proxy.ts, which runs before the render phase
// and so still makes its own separate call.
export const getCurrentUser = cache(async (): Promise<UserRow | null> => {
  const cookieStore = await cookies()
  const jwt = cookieStore.get(COOKIE_NAME)?.value
  if (!jwt) return null

  let token: string
  try {
    const { payload } = await jwtVerify(jwt, secretKey)
    if (typeof payload.token !== 'string') return null
    token = payload.token
  } catch {
    return null
  }

  const session = await sessionsDb.findByTokenHash(hashToken(token))
  if (!session || session.expires_at.getTime() <= Date.now()) return null

  const user = await usersDb.findById(session.user_id)
  if (!user || user.status !== 'active') return null

  await maybeRenew(session, user, token)

  return user
})

// Periodic sweep of expired rows (design spec: no separate cron container
// at this scale). Guarded against re-registering on every module reload in
// dev.
declare global {
  var __sessionSweepStarted: boolean | undefined
}

if (!globalThis.__sessionSweepStarted) {
  globalThis.__sessionSweepStarted = true
  const HOUR_MS = 60 * 60 * 1000
  setInterval(() => {
    sessionsDb.sweepExpired().catch(() => {})
  }, HOUR_MS).unref()
}
