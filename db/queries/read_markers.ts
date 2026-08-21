import { pool } from '../client.ts'

export type ReadMarkerRow = {
  user_id: string
  student_id: string
  last_read_at: Date
}

export async function get(userId: string, studentId: string): Promise<ReadMarkerRow | null> {
  const result = await pool.query<ReadMarkerRow>('SELECT * FROM read_markers WHERE user_id = $1 AND student_id = $2', [
    userId,
    studentId,
  ])
  return result.rows[0] ?? null
}

export async function upsert(userId: string, studentId: string, lastReadAt: Date): Promise<void> {
  await pool.query(
    `INSERT INTO read_markers (user_id, student_id, last_read_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, student_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
    [userId, studentId, lastReadAt],
  )
}
