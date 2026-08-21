import { pool } from '../client.ts'
import type { Executor } from '../client.ts'

// Row type declared next to the SQL that produces it (design spec §7.4) —
// there is no ORM, so this hand-written type is the only thing keeping a
// column rename from silently drifting out of sync with the code that
// reads it. The integration tests for this module are the real check.
export type UserRow = {
  id: string
  username: string
  password_hash: string
  role: 'teacher' | 'student'
  locale: 'ru' | 'en'
  must_change_password: boolean
  status: 'active' | 'archived'
  created_at: Date
}

export async function findByUsername(username: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>('SELECT * FROM users WHERE username = $1', [username])
  return result.rows[0] ?? null
}

export async function findById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id])
  return result.rows[0] ?? null
}

export async function countTeachers(): Promise<number> {
  const result = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM users WHERE role = 'teacher'")
  return Number(result.rows[0]?.count ?? '0')
}

async function insertUser(
  params: {
    username: string
    passwordHash: string
    role: 'teacher' | 'student'
    mustChangePassword: boolean
    locale?: 'ru' | 'en'
  },
  executor: Executor,
): Promise<UserRow> {
  const result = await executor.query<UserRow>(
    `INSERT INTO users (username, password_hash, role, locale, must_change_password)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.username, params.passwordHash, params.role, params.locale ?? 'ru', params.mustChangePassword],
  )
  const row = result.rows[0]
  if (!row) throw new Error('insertUser: insert returned no row')
  return row
}

export async function createTeacher(params: { username: string; passwordHash: string; locale?: 'ru' | 'en' }): Promise<UserRow> {
  return insertUser({ ...params, role: 'teacher', mustChangePassword: false }, pool)
}

// Onboarding a student (design spec §5.2) forces a password change on
// first login, and always runs inside a transaction alongside the linked
// students row (domain/students/onboarding.ts) — hence the explicit
// executor rather than defaulting to the shared pool.
export async function createStudentUser(
  params: { username: string; passwordHash: string; locale?: 'ru' | 'en' },
  executor: Executor,
): Promise<UserRow> {
  return insertUser({ ...params, role: 'student', mustChangePassword: true }, executor)
}

export async function setMustChangePassword(id: string, value: boolean): Promise<void> {
  await pool.query('UPDATE users SET must_change_password = $2 WHERE id = $1', [id, value])
}

export async function setPasswordHash(id: string, passwordHash: string): Promise<void> {
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash])
}

export async function setStatus(id: string, status: 'active' | 'archived'): Promise<void> {
  await pool.query('UPDATE users SET status = $2 WHERE id = $1', [id, status])
}

export async function setLocale(id: string, locale: 'ru' | 'en'): Promise<void> {
  await pool.query('UPDATE users SET locale = $2 WHERE id = $1', [id, locale])
}
