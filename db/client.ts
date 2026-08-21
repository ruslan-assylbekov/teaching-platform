import { Pool, types } from 'pg'
import type { PoolClient } from 'pg'
import { env } from '../lib/env.ts'

// pg's default parser turns SQL `date` columns (OID 1082) into JS Date
// objects at UTC midnight -- exactly the UTC-instant-for-a-calendar-date
// confusion design spec §4.3/§7.2 exist to avoid (class_slots.active_from,
// class_overrides.original_date/new_date, students.started_at). Disabled
// process-wide so every `date` column instead comes back as the plain
// 'YYYY-MM-DD' string Postgres sent, matching the ISO-date-string
// convention domain/schedule/expand.ts already uses throughout. Timestamps
// (created_at, expires_at, run_on) are real instants, not calendar dates,
// and keep pg's normal Date-object parsing.
types.setTypeParser(1082, (value: string) => value)

// Single shared pool for the whole app process. db/ is the only layer
// allowed to import pg directly (design spec §3.2, §7.4).
export const pool = new Pool({ connectionString: env.DATABASE_URL })

// Query functions accept an optional Executor, defaulting to the shared
// pool, so a caller that needs several inserts to commit atomically (e.g.
// domain/students/onboarding.ts creating a users row and a students row
// together) can pass a single transaction-scoped client through instead.
export type Executor = Pool | PoolClient

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
