import * as usersDb from '../../db/queries/users.ts'
import type { UserRow } from '../../db/queries/users.ts'
import { verifyPassword } from './password.ts'
import { isLocked, recordFailure, recordSuccess } from './throttle.ts'

export type LoginResult =
  | { outcome: 'success'; user: UserRow }
  | { outcome: 'locked' }
  | { outcome: 'archived' }
  | { outcome: 'invalid' }

// Pure with respect to next/* — this stays in domain/ so it can call db/
// directly (design spec §3.2 as refined by the Phase 1 plan index). Session
// cookie issuance needs next/headers, so that composition lives one layer
// up, in lib/auth.ts.
export async function attemptLogin(username: string, password: string, ip: string): Promise<LoginResult> {
  if (isLocked(username, ip)) {
    return { outcome: 'locked' }
  }

  const user = await usersDb.findByUsername(username)

  if (!user) {
    recordFailure(username, ip)
    return { outcome: 'invalid' }
  }

  if (user.status === 'archived') {
    // Distinct from a wrong password (design spec §5.4): this is not a
    // security-sensitive distinction to hide, so it doesn't count against
    // the throttle and gets its own "contact your teacher" message.
    return { outcome: 'archived' }
  }

  const valid = await verifyPassword(user.password_hash, password)
  if (!valid) {
    recordFailure(username, ip)
    return { outcome: 'invalid' }
  }

  recordSuccess(username, ip)
  return { outcome: 'success', user }
}
