import { setMustChangePassword, setPasswordHash } from '../../db/queries/users.ts'
import type { UserRow } from '../../db/queries/users.ts'
import { hashPassword, verifyPassword } from './password.ts'

const MIN_PASSWORD_LENGTH = 8

export type ChangePasswordResult =
  | { outcome: 'success' }
  | { outcome: 'wrong-current' }
  | { outcome: 'mismatch' }
  | { outcome: 'too-short' }

// Pure with respect to next/* — stays in domain/ so it can call db/
// directly. The caller (lib/auth.ts) resolves "who is asking" via the
// session cookie and passes the already-authenticated user in.
export async function changePassword(
  user: UserRow,
  params: { currentPassword: string; newPassword: string; confirmPassword: string },
): Promise<ChangePasswordResult> {
  if (params.newPassword !== params.confirmPassword) {
    return { outcome: 'mismatch' }
  }

  if (params.newPassword.length < MIN_PASSWORD_LENGTH) {
    return { outcome: 'too-short' }
  }

  const currentValid = await verifyPassword(user.password_hash, params.currentPassword)
  if (!currentValid) {
    return { outcome: 'wrong-current' }
  }

  const newHash = await hashPassword(params.newPassword)
  await setPasswordHash(user.id, newHash)
  await setMustChangePassword(user.id, false)

  return { outcome: 'success' }
}
