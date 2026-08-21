'use server'

import { markThreadRead } from '../domain/chat/manage.ts'
import { getCurrentUser } from '../lib/session.ts'

export async function markThreadReadAction(studentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return
  await markThreadRead(user.id, studentId)
}
