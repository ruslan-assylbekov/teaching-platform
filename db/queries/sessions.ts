import { pool } from '../client.ts'

export type SessionRow = {
  id: string
  user_id: string
  token_hash: string
  expires_at: Date
}

export async function create(params: {
  userId: string
  tokenHash: string
  expiresAt: Date
}): Promise<SessionRow> {
  const result = await pool.query<SessionRow>(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [params.userId, params.tokenHash, params.expiresAt],
  )
  const row = result.rows[0]
  if (!row) throw new Error('sessions.create: insert returned no row')
  return row
}

export async function findByTokenHash(tokenHash: string): Promise<SessionRow | null> {
  const result = await pool.query<SessionRow>('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash])
  return result.rows[0] ?? null
}

export async function updateExpiry(id: string, expiresAt: Date): Promise<void> {
  await pool.query('UPDATE sessions SET expires_at = $2 WHERE id = $1', [id, expiresAt])
}

export async function deleteByTokenHash(tokenHash: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash])
}

// Used on archive (Plan 02) and lockout/credential-reissue paths: killing
// every session for a user must take effect immediately, not at next
// expiry (design spec §5.3, §5.4).
export async function deleteAllForUser(userId: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
}

export async function sweepExpired(): Promise<number> {
  const result = await pool.query('DELETE FROM sessions WHERE expires_at < now()')
  return result.rowCount ?? 0
}
