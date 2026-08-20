import { changePassword as changePasswordDomain } from '../domain/auth/change-password.ts'
import { attemptLogin } from '../domain/auth/login.ts'
import { createSession, getCurrentUser } from './session.ts'

export type LoginOutcome =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; reason: 'invalid' | 'archived' }

// Composes domain/auth/login.ts (pure verify + throttle) with session
// issuance (needs next/headers, hence lib/ rather than domain/).
export async function login(username: string, password: string, ip: string): Promise<LoginOutcome> {
  const result = await attemptLogin(username, password, ip)

  switch (result.outcome) {
    case 'success':
      await createSession(result.user)
      return { ok: true, mustChangePassword: result.user.must_change_password }
    case 'archived':
      return { ok: false, reason: 'archived' }
    case 'locked':
    case 'invalid':
      // Deliberately identical outcome for both: never let a client tell
      // "wrong password" apart from "locked out from repeated attempts"
      // (design spec §5.4 — the difference is only useful to an attacker
      // probing for valid usernames).
      return { ok: false, reason: 'invalid' }
  }
}

export type ChangePasswordOutcome =
  | { ok: true }
  | { ok: false; reason: 'wrong-current' | 'mismatch' | 'too-short' | 'unauthenticated' }

export async function submitChangePassword(params: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): Promise<ChangePasswordOutcome> {
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, reason: 'unauthenticated' }
  }

  const result = await changePasswordDomain(user, params)
  if (result.outcome === 'success') {
    return { ok: true }
  }
  return { ok: false, reason: result.outcome }
}
