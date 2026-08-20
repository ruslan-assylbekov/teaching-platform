import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { pool } from '../client.ts'
import { countTeachers, createTeacher, findById, findByUsername, setMustChangePassword, setPasswordHash } from './users.ts'

// Needs a real, migrated Postgres reachable via DATABASE_URL — run via
// `docker compose run --rm tools npm run test:integration` (design spec
// §7.4: this is the real type check for hand-written SQL).

function uniqueUsername(): string {
  return `test.${randomUUID()}`
}

const createdIds: string[] = []

afterEach(async () => {
  if (createdIds.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdIds])
    createdIds.length = 0
  }
})

afterAll(async () => {
  await pool.end()
})

describe('users queries', () => {
  it('creates a teacher and finds them by username', async () => {
    const username = uniqueUsername()
    const created = await createTeacher({ username, passwordHash: 'hash-a' })
    createdIds.push(created.id)

    expect(created.role).toBe('teacher')
    expect(created.must_change_password).toBe(false)
    expect(created.locale).toBe('ru')

    const found = await findByUsername(username)
    expect(found?.id).toBe(created.id)
  })

  it('looks up usernames case-insensitively (citext)', async () => {
    const username = uniqueUsername()
    const created = await createTeacher({ username, passwordHash: 'hash-b' })
    createdIds.push(created.id)

    const found = await findByUsername(username.toUpperCase())
    expect(found?.id).toBe(created.id)
  })

  it('finds by id', async () => {
    const username = uniqueUsername()
    const created = await createTeacher({ username, passwordHash: 'hash-c' })
    createdIds.push(created.id)

    const found = await findById(created.id)
    expect(found?.username.toLowerCase()).toBe(username.toLowerCase())
  })

  it('returns null for an unknown username or id', async () => {
    expect(await findByUsername(uniqueUsername())).toBeNull()
    expect(await findById('00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('reflects created teachers in countTeachers', async () => {
    const before = await countTeachers()
    const created = await createTeacher({ username: uniqueUsername(), passwordHash: 'hash-d' })
    createdIds.push(created.id)
    const after = await countTeachers()
    expect(after).toBe(before + 1)
  })

  it('updates password hash and must_change_password independently', async () => {
    const created = await createTeacher({ username: uniqueUsername(), passwordHash: 'hash-e' })
    createdIds.push(created.id)

    await setPasswordHash(created.id, 'hash-f')
    await setMustChangePassword(created.id, true)

    const updated = await findById(created.id)
    expect(updated?.password_hash).toBe('hash-f')
    expect(updated?.must_change_password).toBe(true)
  })
})
