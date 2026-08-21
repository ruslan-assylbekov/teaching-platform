import { DateTime } from 'luxon'
import * as scheduleDb from '../../db/queries/schedule.ts'
import type { OverrideRow, SlotRow } from '../../db/queries/schedule.ts'
import { findConflict } from './conflicts.ts'
import { expandOccurrences } from './expand.ts'
import type { ClassSlot, Occurrence } from './expand.ts'
import { parseTime, toClassOverride, toClassSlot } from './mappers.ts'

export type SlotInput = {
  weekday: number
  startTime: string // 'HH:MM' from a <input type="time">
  durationMinutes: number
  timezone: string
  activeFrom: string
  activeUntil: string | null
}

export type SlotConflict = ClassSlot & { studentId: string; studentName: string }
export type SaveSlotResult = { ok: true; slot: SlotRow } | { ok: false; conflict: SlotConflict }

export async function listSlots(studentId: string): Promise<SlotRow[]> {
  return scheduleDb.listSlotsForStudent(studentId, { role: 'teacher' })
}

function toCandidate(input: SlotInput): Omit<ClassSlot, 'id'> {
  return {
    weekday: input.weekday,
    startTime: parseTime(input.startTime),
    durationMinutes: input.durationMinutes,
    timezone: input.timezone,
    activeFrom: input.activeFrom,
    activeUntil: input.activeUntil,
  }
}

// Design spec §5.4: "Two overlapping class slots -> rejected at save,
// naming the conflicting slot." Exclusivity is global -- one student per
// weekday/time across the whole roster, not just within one student's own
// slots -- since a solo tutor can only teach one class at a time.
// excludeSlotId lets an edit compare against every *other* slot without
// flagging itself.
async function checkConflict(input: SlotInput, excludeSlotId?: string): Promise<SlotConflict | null> {
  const existingRows = await scheduleDb.listAllActiveSlots()
  const others = excludeSlotId ? existingRows.filter((r) => r.id !== excludeSlotId) : existingRows
  const candidates = others.map((row) => ({ ...toClassSlot(row), studentId: row.student_id, studentName: row.student_full_name }))
  return findConflict(toCandidate(input), candidates)
}

export async function createSlot(studentId: string, input: SlotInput): Promise<SaveSlotResult> {
  const conflict = await checkConflict(input)
  if (conflict) return { ok: false, conflict }

  const slot = await scheduleDb.createSlot({
    studentId,
    weekday: input.weekday,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    timezone: input.timezone,
    activeFrom: input.activeFrom,
    activeUntil: input.activeUntil,
  })
  return { ok: true, slot }
}

export async function updateSlot(slotId: string, input: SlotInput): Promise<SaveSlotResult> {
  const conflict = await checkConflict(input, slotId)
  if (conflict) return { ok: false, conflict }

  const slot = await scheduleDb.updateSlot(slotId, {
    weekday: input.weekday,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    timezone: input.timezone,
    activeFrom: input.activeFrom,
    activeUntil: input.activeUntil,
  })
  if (!slot) throw new Error('updateSlot: slot not found')
  return { ok: true, slot }
}

export async function deleteSlot(slotId: string): Promise<void> {
  await scheduleDb.deleteSlot(slotId)
}

export async function listOverrides(slotId: string): Promise<OverrideRow[]> {
  return scheduleDb.listOverridesForSlot(slotId)
}

export type OverrideInput = {
  slotId: string
  originalDate: string
  action: 'cancelled' | 'moved'
  newDate: string | null
  newStartTime: string | null // 'HH:MM' or null
  note: string | null
}

export async function saveOverride(input: OverrideInput): Promise<OverrideRow> {
  return scheduleDb.createOverride({
    slotId: input.slotId,
    originalDate: input.originalDate,
    action: input.action,
    newDate: input.newDate,
    newStartTime: input.newStartTime ? `${input.newStartTime}:00` : null,
    note: input.note,
  })
}

export async function deleteOverride(overrideId: string): Promise<void> {
  await scheduleDb.deleteOverride(overrideId)
}

// Per-occurrence view for the Schedule tab (design spec §5.1): the next N
// weeks of a single slot, overrides already applied. Reuses expand.ts
// rather than duplicating occurrence logic -- this is exactly the module
// the whole layering discipline exists to protect.
export async function listUpcomingOccurrences(slotRow: SlotRow, weeksAhead: number): Promise<Occurrence[]> {
  const overrides = await scheduleDb.listOverridesForSlot(slotRow.id)
  const now = DateTime.now().setZone(slotRow.timezone)
  return expandOccurrences(toClassSlot(slotRow), overrides.map(toClassOverride), {
    from: now,
    to: now.plus({ weeks: weeksAhead }),
  })
}
