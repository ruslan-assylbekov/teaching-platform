import { pool } from '../client.ts'
import type { Executor } from '../client.ts'
import * as sessionsDb from './sessions.ts'
import * as usersDb from './users.ts'

export type StudentRow = {
  user_id: string
  full_name: string
  grade: string
  school: string | null
  level: string
  objectives: string | null
  private_notes: string | null
  parent_phone: string | null
  parent_name: string | null
  started_at: string // 'YYYY-MM-DD' -- see db/client.ts's date type parser override
}

export type StudentWithAccount = StudentRow & {
  username: string
  status: 'active' | 'archived'
}

// Design spec §3.4: every query touching student-scoped data re-checks
// ownership inside the query itself, not just in the calling page. A
// teacher caller sees any student; a student caller can only ever supply
// their own id, and the WHERE clause enforces that even if a future
// routing bug passed the wrong one.
export type StudentAccessContext = { role: 'teacher' } | { role: 'student'; userId: string }

export async function findById(studentId: string, context: StudentAccessContext): Promise<StudentRow | null> {
  if (context.role === 'student') {
    const result = await pool.query<StudentRow>('SELECT * FROM students WHERE user_id = $1 AND user_id = $2', [
      studentId,
      context.userId,
    ])
    return result.rows[0] ?? null
  }
  const result = await pool.query<StudentRow>('SELECT * FROM students WHERE user_id = $1', [studentId])
  return result.rows[0] ?? null
}

// Teacher-only (the student's own view never needs their own status/
// username alongside their profile the way the detail page's archive/
// unarchive UI does) -- no StudentAccessContext scoping, unlike findById.
export async function findByIdWithAccount(studentId: string): Promise<StudentWithAccount | null> {
  const result = await pool.query<StudentWithAccount>(
    `SELECT s.*, u.username, u.status
     FROM students s
     JOIN users u ON u.id = s.user_id
     WHERE s.user_id = $1`,
    [studentId],
  )
  return result.rows[0] ?? null
}

export async function listActive(): Promise<StudentWithAccount[]> {
  const result = await pool.query<StudentWithAccount>(
    `SELECT s.*, u.username, u.status
     FROM students s
     JOIN users u ON u.id = s.user_id
     WHERE u.status = 'active'
     ORDER BY s.full_name`,
  )
  return result.rows
}

// Archived students are hidden from the default directory (design spec
// §5.3) but still need to be reachable to un-archive them.
export async function listArchived(): Promise<StudentWithAccount[]> {
  const result = await pool.query<StudentWithAccount>(
    `SELECT s.*, u.username, u.status
     FROM students s
     JOIN users u ON u.id = s.user_id
     WHERE u.status = 'archived'
     ORDER BY s.full_name`,
  )
  return result.rows
}

export async function create(
  params: {
    userId: string
    fullName: string
    grade: string
    school: string | null
    level: string
    objectives: string | null
    privateNotes: string | null
    parentPhone: string | null
    parentName: string | null
  },
  executor: Executor,
): Promise<StudentRow> {
  const result = await executor.query<StudentRow>(
    `INSERT INTO students (user_id, full_name, grade, school, level, objectives, private_notes, parent_phone, parent_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      params.userId,
      params.fullName,
      params.grade,
      params.school,
      params.level,
      params.objectives,
      params.privateNotes,
      params.parentPhone,
      params.parentName,
    ],
  )
  const row = result.rows[0]
  if (!row) throw new Error('students.create: insert returned no row')
  return row
}

// Full replace of the editable profile fields, not a partial patch -- the
// Profile tab form always submits every field, including cleared optional
// ones, which sidesteps the "was null provided on purpose, or just
// omitted?" ambiguity a COALESCE-based partial update would have.
export async function update(
  userId: string,
  fields: {
    fullName: string
    grade: string
    school: string | null
    level: string
    objectives: string | null
    privateNotes: string | null
    parentPhone: string | null
    parentName: string | null
  },
): Promise<StudentRow | null> {
  const result = await pool.query<StudentRow>(
    `UPDATE students SET
       full_name = $2, grade = $3, school = $4, level = $5,
       objectives = $6, private_notes = $7, parent_phone = $8, parent_name = $9
     WHERE user_id = $1
     RETURNING *`,
    [
      userId,
      fields.fullName,
      fields.grade,
      fields.school,
      fields.level,
      fields.objectives,
      fields.privateNotes,
      fields.parentPhone,
      fields.parentName,
    ],
  )
  return result.rows[0] ?? null
}

// Archive is the default removal action (design spec §5.3): login
// disabled, existing sessions invalidated immediately, every other row
// untouched. Touches users/sessions as well as students because "archive a
// student" is fundamentally a student-centric action, even though the
// column it flips lives on users.
export async function archive(userId: string): Promise<void> {
  await usersDb.setStatus(userId, 'archived')
  await sessionsDb.deleteAllForUser(userId)
}

export async function unarchive(userId: string): Promise<void> {
  await usersDb.setStatus(userId, 'active')
}

// Hard delete, gated behind a typed confirmation at the app/ layer (design
// spec §5.3) -- never exposed as a plain DELETE route. Deletes the users
// row; ON DELETE CASCADE takes students, class_slots, class_overrides (and,
// from Plan 03, messages/read_markers) with it.
export async function remove(userId: string): Promise<void> {
  await pool.query('DELETE FROM users WHERE id = $1', [userId])
}
