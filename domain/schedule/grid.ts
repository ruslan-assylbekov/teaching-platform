import { DateTime } from 'luxon'
import * as scheduleDb from '../../db/queries/schedule.ts'
import type { SlotWithStudent } from '../../db/queries/schedule.ts'
import { expandOccurrences } from './expand.ts'
import { toClassOverride, toClassSlot } from './mappers.ts'

// Master-calendar composition (design spec's schedule model, §4.3, viewed
// as a whole-roster grid rather than one student's upcoming list). Rows are
// a fixed working-hours window so empty, bookable cells exist even before
// anything is scheduled there; any slot whose time falls outside the window
// still gets its own row, so an existing booking is never hidden.
const WORKING_HOURS_START_MINUTES = 8 * 60 // 08:00
const WORKING_HOURS_END_MINUTES = 21 * 60 // 21:00
const ROW_INTERVAL_MINUTES = 30

export type GridTime = { hour: number; minute: number }

export type GridCell = {
  slotId: string
  studentId: string
  studentName: string
  weekday: number
  time: GridTime // the slot's pattern time -- where it sits in the grid, even when moved
  durationMinutes: number
  timezone: string
  activeFrom: string
  activeUntil: string | null
  status: 'scheduled' | 'moved' | 'cancelled'
  date: string
  start: DateTime
  end: DateTime
  originalDate: string | null
  note: string | null
}

export type WeekGrid = {
  weekStart: string
  rows: GridTime[]
  cells: GridCell[]
}

function timeMinutes(t: GridTime): number {
  return t.hour * 60 + t.minute
}

function buildRows(slotTimes: GridTime[]): GridTime[] {
  const minutes = new Set<number>()
  for (let m = WORKING_HOURS_START_MINUTES; m <= WORKING_HOURS_END_MINUTES; m += ROW_INTERVAL_MINUTES) {
    minutes.add(m)
  }
  for (const t of slotTimes) minutes.add(timeMinutes(t))
  return [...minutes].sort((a, b) => a - b).map((m) => ({ hour: Math.floor(m / 60), minute: m % 60 }))
}

// Monday of the ISO week containing `reference` (Luxon's week starts Monday
// by default -- matches expand.ts's weekday=0-is-Monday convention).
export function startOfWeek(reference: DateTime): DateTime {
  return reference.startOf('week')
}

async function buildGrid(slots: SlotWithStudent[], weekStart: DateTime): Promise<WeekGrid> {
  // expandOccurrences treats both range ends as inclusive (expand.ts walks
  // while cursor <= windowEnd), so a `to` of exactly next Monday would also
  // pick up *next* week's occurrence -- normally masked by taking [0] since
  // this week's sorts first, but if this week's is cancelled (and so absent
  // from expandOccurrences' output entirely) that stray next-week occurrence
  // becomes occurrences[0] instead. Bounding `to` at this week's Sunday
  // keeps the inclusive range inside the displayed week only.
  const weekEndInclusive = weekStart.plus({ days: 6 })
  const weekEndExclusive = weekStart.plus({ days: 7 })
  const weekStartISO = weekStart.toISODate() ?? ''
  const weekEndISO = weekEndExclusive.toISODate() ?? ''
  const cells: GridCell[] = []

  for (const slotRow of slots) {
    const classSlot = toClassSlot(slotRow)
    const overrideRows = await scheduleDb.listOverridesForSlot(slotRow.id)
    const occurrences = expandOccurrences(classSlot, overrideRows.map(toClassOverride), { from: weekStart, to: weekEndInclusive })
    const occurrence = occurrences[0]

    // expandOccurrences deliberately omits cancelled occurrences from its
    // output (see expand.ts) -- a cancelled week is detected directly from
    // the override row instead, without touching that pure module's contract.
    const cancelledThisWeek = occurrence
      ? undefined
      : overrideRows.find((o) => o.action === 'cancelled' && o.original_date >= weekStartISO && o.original_date < weekEndISO)

    if (!occurrence && !cancelledThisWeek) continue

    if (occurrence) {
      cells.push({
        slotId: slotRow.id,
        studentId: slotRow.student_id,
        studentName: slotRow.student_full_name,
        weekday: slotRow.weekday,
        time: classSlot.startTime,
        durationMinutes: classSlot.durationMinutes,
        timezone: classSlot.timezone,
        activeFrom: classSlot.activeFrom,
        activeUntil: classSlot.activeUntil,
        status: occurrence.status,
        date: occurrence.date,
        start: occurrence.start,
        end: occurrence.end,
        originalDate: occurrence.originalDate,
        note: occurrence.note,
      })
    } else if (cancelledThisWeek) {
      const start = DateTime.fromISO(cancelledThisWeek.original_date, { zone: slotRow.timezone }).set({
        hour: classSlot.startTime.hour,
        minute: classSlot.startTime.minute,
      })
      cells.push({
        slotId: slotRow.id,
        studentId: slotRow.student_id,
        studentName: slotRow.student_full_name,
        weekday: slotRow.weekday,
        time: classSlot.startTime,
        durationMinutes: classSlot.durationMinutes,
        timezone: classSlot.timezone,
        activeFrom: classSlot.activeFrom,
        activeUntil: classSlot.activeUntil,
        status: 'cancelled',
        date: cancelledThisWeek.original_date,
        start,
        end: start.plus({ minutes: classSlot.durationMinutes }),
        originalDate: cancelledThisWeek.original_date,
        note: cancelledThisWeek.note,
      })
    }
  }

  return {
    weekStart: weekStartISO,
    rows: buildRows(slots.map((s) => toClassSlot(s).startTime)),
    cells,
  }
}

export async function getTeacherWeekGrid(weekStart: DateTime): Promise<WeekGrid> {
  const slots = await scheduleDb.listAllActiveSlots()
  return buildGrid(slots, weekStart)
}

export async function getStudentWeekGrid(studentId: string, studentName: string, weekStart: DateTime): Promise<WeekGrid> {
  const slotRows = await scheduleDb.listSlotsForStudent(studentId, { role: 'student', userId: studentId })
  const slots: SlotWithStudent[] = slotRows.map((row) => ({ ...row, student_full_name: studentName }))
  return buildGrid(slots, weekStart)
}
