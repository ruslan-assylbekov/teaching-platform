import { pool } from '../client.ts'
import type { StudentAccessContext } from './students.ts'

export type MessageRow = {
  id: string
  student_id: string
  sender: 'teacher' | 'student'
  body: string
  created_at: Date
}

// Same re-check-ownership-inside-the-query pattern as students.ts/
// schedule.ts (design spec §3.4).
function scopeClause(context: StudentAccessContext, paramIndex: number): { clause: string; params: unknown[] } {
  if (context.role === 'student') {
    return { clause: ` AND student_id = $${paramIndex}`, params: [context.userId] }
  }
  return { clause: '', params: [] }
}

export async function listForStudent(studentId: string, context: StudentAccessContext): Promise<MessageRow[]> {
  const scope = scopeClause(context, 2)
  const result = await pool.query<MessageRow>(
    `SELECT * FROM messages WHERE student_id = $1${scope.clause} ORDER BY created_at ASC`,
    [studentId, ...scope.params],
  )
  return result.rows
}

// Last-Event-ID resumption (design spec §5.4/§7.3): everything strictly
// after the referenced message's timestamp -- created_at is what actually
// orders messages, not the opaque id itself.
export async function listSince(studentId: string, context: StudentAccessContext, sinceMessageId: string): Promise<MessageRow[]> {
  const scope = scopeClause(context, 3)
  const result = await pool.query<MessageRow>(
    `SELECT * FROM messages
     WHERE student_id = $1${scope.clause}
       AND created_at > (SELECT created_at FROM messages WHERE id = $2)
     ORDER BY created_at ASC`,
    [studentId, sinceMessageId, ...scope.params],
  )
  return result.rows
}

// sender is derived from context.role, not accepted as a separate
// parameter -- makes it impossible for a caller to insert a message
// attributed to the wrong side of the conversation. Returns null (rather
// than inserting) if a student context doesn't own studentId, the same
// ownership guarantee the SELECT-side queries bake into their WHERE
// clause, applied to the one query here that isn't a SELECT.
export async function create(studentId: string, context: StudentAccessContext, body: string): Promise<MessageRow | null> {
  if (context.role === 'student' && context.userId !== studentId) {
    return null
  }
  const sender = context.role === 'teacher' ? 'teacher' : 'student'
  const result = await pool.query<MessageRow>(
    `INSERT INTO messages (student_id, sender, body) VALUES ($1, $2, $3) RETURNING *`,
    [studentId, sender, body],
  )
  const row = result.rows[0]
  if (!row) throw new Error('messages.create: insert returned no row')
  return row
}
