import { pool } from '../client.ts'
import type { StudentAccessContext } from './students.ts'

// start_time/new_start_time come back as plain 'HH:MM:SS' strings (pg has
// no default Date-object parser for `time`, unlike `date` -- see
// db/client.ts). active_from/active_until/original_date/new_date are
// 'YYYY-MM-DD' strings thanks to that same override. Both match
// domain/schedule/expand.ts's ClassSlot/ClassOverride shapes closely
// enough that the mapping in domain/students/dashboard.ts is a thin one.
export type SlotRow = {
  id: string
  student_id: string
  weekday: number
  start_time: string
  duration_minutes: number
  timezone: string
  active_from: string
  active_until: string | null
}

export type OverrideRow = {
  id: string
  slot_id: string
  original_date: string
  action: 'cancelled' | 'moved'
  new_date: string | null
  new_start_time: string | null
  note: string | null
}

// Same re-check-ownership-inside-the-query pattern as students.ts (design
// spec §3.4) -- listOverridesForSlot etc. don't repeat it because they're
// only ever called with a slotId whose ownership was already established
// by a prior listSlotsForStudent call in the same request.
export async function listSlotsForStudent(studentId: string, context: StudentAccessContext): Promise<SlotRow[]> {
  if (context.role === 'student') {
    const result = await pool.query<SlotRow>(
      'SELECT * FROM class_slots WHERE student_id = $1 AND student_id = $2 ORDER BY weekday, start_time',
      [studentId, context.userId],
    )
    return result.rows
  }
  const result = await pool.query<SlotRow>('SELECT * FROM class_slots WHERE student_id = $1 ORDER BY weekday, start_time', [
    studentId,
  ])
  return result.rows
}

export type SlotWithStudent = SlotRow & { student_full_name: string }

// Backs both the master calendar's grid (all active students at once) and
// the global exclusivity check in domain/schedule/manage.ts::checkConflict
// -- a slot belonging to an archived student doesn't block booking that
// weekday/time for someone else, matching how listActive() already hides
// archived students from the rest of the teacher UI.
export async function listAllActiveSlots(): Promise<SlotWithStudent[]> {
  const result = await pool.query<SlotWithStudent>(
    `SELECT cs.*, s.full_name AS student_full_name
     FROM class_slots cs
     JOIN students s ON s.user_id = cs.student_id
     JOIN users u ON u.id = s.user_id
     WHERE u.status = 'active'
     ORDER BY cs.weekday, cs.start_time`,
  )
  return result.rows
}

export async function createSlot(params: {
  studentId: string
  weekday: number
  startTime: string
  durationMinutes: number
  timezone: string
  activeFrom: string
  activeUntil: string | null
}): Promise<SlotRow> {
  const result = await pool.query<SlotRow>(
    `INSERT INTO class_slots (student_id, weekday, start_time, duration_minutes, timezone, active_from, active_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.studentId,
      params.weekday,
      params.startTime,
      params.durationMinutes,
      params.timezone,
      params.activeFrom,
      params.activeUntil,
    ],
  )
  const row = result.rows[0]
  if (!row) throw new Error('schedule.createSlot: insert returned no row')
  return row
}

export async function updateSlot(
  slotId: string,
  fields: {
    weekday: number
    startTime: string
    durationMinutes: number
    timezone: string
    activeFrom: string
    activeUntil: string | null
  },
): Promise<SlotRow | null> {
  const result = await pool.query<SlotRow>(
    `UPDATE class_slots SET
       weekday = $2, start_time = $3, duration_minutes = $4, timezone = $5, active_from = $6, active_until = $7
     WHERE id = $1
     RETURNING *`,
    [slotId, fields.weekday, fields.startTime, fields.durationMinutes, fields.timezone, fields.activeFrom, fields.activeUntil],
  )
  return result.rows[0] ?? null
}

export async function deleteSlot(slotId: string): Promise<void> {
  await pool.query('DELETE FROM class_slots WHERE id = $1', [slotId])
}

export async function listOverridesForSlot(slotId: string): Promise<OverrideRow[]> {
  const result = await pool.query<OverrideRow>('SELECT * FROM class_overrides WHERE slot_id = $1 ORDER BY original_date', [
    slotId,
  ])
  return result.rows
}

// Upserts on (slot_id, original_date): changing your mind from "cancelled"
// to "moved" (or editing a move's new date/time) for the same original
// date should update the existing override, not require a delete-then-
// create round trip against the schema's UNIQUE constraint.
export async function createOverride(params: {
  slotId: string
  originalDate: string
  action: 'cancelled' | 'moved'
  newDate: string | null
  newStartTime: string | null
  note: string | null
}): Promise<OverrideRow> {
  const result = await pool.query<OverrideRow>(
    `INSERT INTO class_overrides (slot_id, original_date, action, new_date, new_start_time, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (slot_id, original_date) DO UPDATE SET
       action = EXCLUDED.action,
       new_date = EXCLUDED.new_date,
       new_start_time = EXCLUDED.new_start_time,
       note = EXCLUDED.note
     RETURNING *`,
    [params.slotId, params.originalDate, params.action, params.newDate, params.newStartTime, params.note],
  )
  const row = result.rows[0]
  if (!row) throw new Error('schedule.createOverride: insert returned no row')
  return row
}

export async function deleteOverride(overrideId: string): Promise<void> {
  await pool.query('DELETE FROM class_overrides WHERE id = $1', [overrideId])
}
