import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { pool } from '../client.ts'
import { create, deleteAllForUser, deleteByTokenHash, findByTokenHash, sweepExpired, updateExpiry } from './sessions.ts'
import { createTeacher } from './users.ts'
import type { UserRow } from './users.ts'

function uniqueUsername(): string {
  return `test.${randomUUID()}`
}

const createdUserIds: string[] = []

// sessions rows cascade-delete with their user (ON DELETE CASCADE in the
// migration), so cleaning up the user is enough.
async function makeUser(): Promise<UserRow> {
  const user = await createTeacher({ username: uniqueUsername(), passwordHash: 'hash' })
  createdUserIds.push(user.id)
  return user
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

describe('sessions queries', () => {
  it('creates a session and finds it by token hash', async () => {
    const user = await makeUser()
    const expiresAt = new Date(Date.now() + 60_000)
    const session = await create({ userId: user.id, tokenHash: 'hash-1', expiresAt })

    const found = await findByTokenHash('hash-1')
    expect(found?.id).toBe(session.id)
    expect(found?.user_id).toBe(user.id)
  })

  it('deletes a session by token hash', async () => {
    const user = await makeUser()
    await create({ userId: user.id, tokenHash: 'hash-2', expiresAt: new Date(Date.now() + 60_000) })

    await deleteByTokenHash('hash-2')

    expect(await findByTokenHash('hash-2')).toBeNull()
  })

  it('deletes every session for a user', async () => {
    const user = await makeUser()
    await create({ userId: user.id, tokenHash: 'hash-3a', expiresAt: new Date(Date.now() + 60_000) })
    await create({ userId: user.id, tokenHash: 'hash-3b', expiresAt: new Date(Date.now() + 60_000) })

    await deleteAllForUser(user.id)

    expect(await findByTokenHash('hash-3a')).toBeNull()
    expect(await findByTokenHash('hash-3b')).toBeNull()
  })

  it('updates expiry for sliding renewal', async () => {
    const user = await makeUser()
    const session = await create({ userId: user.id, tokenHash: 'hash-4', expiresAt: new Date(Date.now() + 60_000) })

    const newExpiry = new Date(Date.now() + 120_000)
    await updateExpiry(session.id, newExpiry)

    const found = await findByTokenHash('hash-4')
    expect(found?.expires_at.getTime()).toBe(newExpiry.getTime())
  })

  it('sweeps only expired sessions', async () => {
    const user = await makeUser()
    await create({ userId: user.id, tokenHash: 'hash-5-expired', expiresAt: new Date(Date.now() - 1000) })
    await create({ userId: user.id, tokenHash: 'hash-5-active', expiresAt: new Date(Date.now() + 60_000) })

    await sweepExpired()

    expect(await findByTokenHash('hash-5-expired')).toBeNull()
    expect(await findByTokenHash('hash-5-active')).not.toBeNull()
  })
})
