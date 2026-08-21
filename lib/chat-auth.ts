import type { StudentAccessContext } from '../db/queries/students.ts'
import { getCurrentUser } from './session.ts'

// Shared by both chat routes (design spec §3.4's ownership check, applied
// here too): a student may only ever open/post to their own thread; the
// teacher may reach any.
export type ChatAuthResult = { ok: true; context: StudentAccessContext } | { ok: false; status: 401 | 403 }

export async function resolveChatAccess(studentId: string): Promise<ChatAuthResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, status: 401 }

  if (user.role === 'teacher') {
    return { ok: true, context: { role: 'teacher' } }
  }

  if (user.id !== studentId) {
    return { ok: false, status: 403 }
  }

  return { ok: true, context: { role: 'student', userId: user.id } }
}
