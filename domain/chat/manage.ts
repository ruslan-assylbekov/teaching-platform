import * as messagesDb from '../../db/queries/messages.ts'
import type { MessageRow } from '../../db/queries/messages.ts'
import * as readMarkersDb from '../../db/queries/read_markers.ts'
import type { StudentAccessContext } from '../../db/queries/students.ts'
import { countUnread } from './unread.ts'

export async function listThread(studentId: string, context: StudentAccessContext): Promise<MessageRow[]> {
  return messagesDb.listForStudent(studentId, context)
}

export async function listThreadSince(
  studentId: string,
  context: StudentAccessContext,
  sinceMessageId: string,
): Promise<MessageRow[]> {
  return messagesDb.listSince(studentId, context, sinceMessageId)
}

export async function sendMessage(studentId: string, context: StudentAccessContext, body: string): Promise<MessageRow | null> {
  return messagesDb.create(studentId, context, body)
}

// Called when a chat panel mounts/becomes visible (design spec §4.4:
// unread state is one timestamp per participant).
export async function markThreadRead(userId: string, studentId: string): Promise<void> {
  await readMarkersDb.upsert(userId, studentId, new Date())
}

export async function getUnreadCount(studentId: string, context: StudentAccessContext, userId: string): Promise<number> {
  const messages = await messagesDb.listForStudent(studentId, context)
  const marker = await readMarkersDb.get(userId, studentId)
  return countUnread(messages, marker?.last_read_at ?? null)
}

// For the teacher sidebar/Today (design spec §2's Today, and the sidebar
// badge Plan 02 stubbed at 0). N+1 queries across a handful of students is
// fine at Phase 1 scale; revisit only if the roster grows meaningfully.
export async function getUnreadCountsForTeacher(teacherId: string, studentIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const studentId of studentIds) {
    counts.set(studentId, await getUnreadCount(studentId, { role: 'teacher' }, teacherId))
  }
  return counts
}
