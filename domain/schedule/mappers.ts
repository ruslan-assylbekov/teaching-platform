import type { OverrideRow, SlotRow } from '../../db/queries/schedule.ts'
import type { ClassOverride, ClassSlot } from './expand.ts'

// Shared between domain/students/dashboard.ts and domain/schedule/manage.ts
// -- both need to turn db/ rows into expand.ts's/conflicts.ts's shapes.
// Lives outside expand.ts itself, which imports nothing but Luxon.
export function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(':').map(Number) as [number, number]
  return { hour, minute }
}

export function toClassSlot(row: SlotRow): ClassSlot {
  return {
    id: row.id,
    weekday: row.weekday,
    startTime: parseTime(row.start_time),
    durationMinutes: row.duration_minutes,
    timezone: row.timezone,
    activeFrom: row.active_from,
    activeUntil: row.active_until,
  }
}

export function toClassOverride(row: OverrideRow): ClassOverride {
  return {
    slotId: row.slot_id,
    originalDate: row.original_date,
    action: row.action,
    newDate: row.new_date,
    newStartTime: row.new_start_time ? parseTime(row.new_start_time) : null,
    note: row.note,
  }
}
