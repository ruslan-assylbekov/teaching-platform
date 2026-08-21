import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { pool } from '../client.ts'
import {
  archive,
  create,
  findById,
  findByIdWithAccount,
  listActive,
  listArchived,
  remove,
  unarchive,
  update,
} from './students.ts'
import { createStudentUser } from './users.ts'

function uniqueUsername(): string {
  return `test.${randomUUID()}`
}

const createdUserIds: string[] = []

async function makeStudent(overrides: Partial<Parameters<typeof create>[0]> = {}) {
  const user = await createStudentUser({ username: uniqueUsername(), passwordHash: 'hash' }, pool)
  createdUserIds.push(user.id)
  const student = await create(
    {
      userId: user.id,
      fullName: 'Aisha Kadyrova',
      grade: '9',
      school: null,
      level: 'intermediate',
      objectives: null,
      privateNotes: null,
      parentPhone: null,
      parentName: null,
      ...overrides,
    },
    pool,
  )
  return { user, student }
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds])
    createdUserIds.length = 0
  }
})

afterAll(async () => {
  await pool.end()
})

describe('students queries', () => {
  it('creates and finds a student by id (teacher context)', async () => {
    const { user } = await makeStudent()
    const found = await findById(user.id, { role: 'teacher' })
    expect(found?.full_name).toBe('Aisha Kadyrova')
  })

  it('lets a student read their own profile', async () => {
    const { user } = await makeStudent()
    const found = await findById(user.id, { role: 'student', userId: user.id })
    expect(found?.user_id).toBe(user.id)
  })

  // The cross-student isolation check design spec §3.4 insists on: a
  // student-scoped query called with another student's id must return
  // nothing, not that other student's row.
  it('returns null when a student requests a different student\'s profile', async () => {
    const { user: owner } = await makeStudent({ fullName: 'Owner' })
    const { user: intruder } = await makeStudent({ fullName: 'Intruder' })

    const result = await findById(owner.id, { role: 'student', userId: intruder.id })
    expect(result).toBeNull()
  })

  it('updates the full editable profile', async () => {
    const { user } = await makeStudent()
    const updated = await update(user.id, {
      fullName: 'Aisha K.',
      grade: '10',
      school: 'School 5',
      level: 'advanced',
      objectives: 'Prepare for olympiad',
      privateNotes: 'Very diligent',
      parentPhone: '+7 700 000 00 00',
      parentName: 'Mrs Kadyrova',
    })
    expect(updated).toMatchObject({
      full_name: 'Aisha K.',
      school: 'School 5',
      private_notes: 'Very diligent',
    })
  })

  it('lists active students and excludes archived ones', async () => {
    const { user: activeUser } = await makeStudent({ fullName: 'Active One' })
    const { user: archivedUser } = await makeStudent({ fullName: 'Archived One' })
    await archive(archivedUser.id)

    const active = await listActive()
    const archived = await listArchived()

    expect(active.some((s) => s.user_id === activeUser.id)).toBe(true)
    expect(active.some((s) => s.user_id === archivedUser.id)).toBe(false)
    expect(archived.some((s) => s.user_id === archivedUser.id)).toBe(true)
  })

  it('archive disables login status and invalidates sessions; unarchive restores it', async () => {
    const { user } = await makeStudent()
    await pool.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval \'1 day\')', [
      user.id,
      `hash-${user.id}`,
    ])

    await archive(user.id)
    const afterArchive = await findByIdWithAccount(user.id)
    expect(afterArchive?.status).toBe('archived')
    const sessionsAfterArchive = await pool.query('SELECT * FROM sessions WHERE user_id = $1', [user.id])
    expect(sessionsAfterArchive.rowCount).toBe(0)

    await unarchive(user.id)
    const afterUnarchive = await findByIdWithAccount(user.id)
    expect(afterUnarchive?.status).toBe('active')
  })

  it('remove hard-deletes the account and cascades to the student row', async () => {
    const { user } = await makeStudent()
    await remove(user.id)

    const userRow = await pool.query('SELECT * FROM users WHERE id = $1', [user.id])
    expect(userRow.rowCount).toBe(0)
    const studentRow = await pool.query('SELECT * FROM students WHERE user_id = $1', [user.id])
    expect(studentRow.rowCount).toBe(0)

    // Prevent afterEach from trying to delete an already-gone user.
    createdUserIds.splice(createdUserIds.indexOf(user.id), 1)
  })
})
