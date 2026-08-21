import { DateTime } from 'luxon'

// The single most important structural decision in the design (spec §3.3,
// reiterated by the Phase 1 plan index): this module imports nothing but
// Luxon. No db/, no next/*, not even lib/env.ts. Every DST/edge case is
// unit-testable with no server and no database. Types here are
// self-contained and deliberately decoupled from db/queries/schedule.ts's
// row types — the caller (domain/students/dashboard.ts) maps DB rows into
// these shapes.

// weekday: 0 = Monday .. 6 = Sunday (ISO order — Luxon's own .weekday minus
// one). Picked because it makes the arithmetic below a direct offset with
// no conversion table; there is no spec-mandated convention, so this is
// the one authority for it — the UI must match it exactly.
export type ClassSlot = {
  id: string
  weekday: number
  startTime: { hour: number; minute: number }
  durationMinutes: number
  timezone: string
  activeFrom: string // ISO date, e.g. '2026-03-05'
  activeUntil: string | null
}

export type ClassOverride = {
  slotId: string
  originalDate: string // ISO date
  action: 'cancelled' | 'moved'
  newDate: string | null
  newStartTime: { hour: number; minute: number } | null
  note: string | null
}

export type Occurrence = {
  slotId: string
  date: string // ISO date this occurrence actually falls on, post-override
  start: DateTime
  end: DateTime
  status: 'scheduled' | 'moved'
  originalDate: string | null // set only when status is 'moved'
  note: string | null
  // True when the wall-clock time requested did not exist in this zone on
  // this date (a spring-forward gap, spec §7.2) and Luxon silently shifted
  // it forward. Surfaced rather than hidden, per §7.2's requirement that
  // this be an explicit decision, not a trusted `.isValid`.
  wallClockShifted: boolean
}

function firstOnOrAfter(weekday0to6: number, start: DateTime): DateTime {
  const targetLuxonWeekday = weekday0to6 + 1 // Luxon: 1 = Monday .. 7 = Sunday
  const diff = (targetLuxonWeekday - start.weekday + 7) % 7
  return start.plus({ days: diff })
}

function maxISODate(a: string, b: string): string {
  return a > b ? a : b
}

function minISODate(a: string, b: string): string {
  return a < b ? a : b
}

function resolveWallClock(
  dateISO: string,
  time: { hour: number; minute: number },
  zone: string,
): { dateTime: DateTime; shifted: boolean } {
  const [year, month, day] = dateISO.split('-').map(Number) as [number, number, number]
  const dateTime = DateTime.fromObject({ year, month, day, hour: time.hour, minute: time.minute }, { zone })
  const shifted = dateTime.hour !== time.hour || dateTime.minute !== time.minute
  return { dateTime, shifted }
}

export function expandOccurrences(
  slot: ClassSlot,
  overrides: ClassOverride[],
  range: { from: DateTime; to: DateTime },
): Occurrence[] {
  // Contract note: this walks the slot's weekly cadence within `range` and
  // applies whatever override exists for each visited *original* date. An
  // occurrence whose original date falls outside `range` is never visited,
  // even if a 'moved' override sends its reported date into the window a
  // caller actually cares about. Callers that need a reschedule from
  // outside a narrow window to show up (domain/students/dashboard.ts,
  // domain/students/today.ts) search a wider range and filter the results
  // afterward rather than this function guessing at caller intent.
  const overridesByDate = new Map(
    overrides.filter((o) => o.slotId === slot.id).map((o) => [o.originalDate, o] as const),
  )

  const rangeFromISO = range.from.toISODate()
  const rangeToISO = range.to.toISODate()
  if (!rangeFromISO || !rangeToISO) return []

  const windowStart = maxISODate(slot.activeFrom, rangeFromISO)
  const windowEnd = slot.activeUntil ? minISODate(slot.activeUntil, rangeToISO) : rangeToISO

  if (windowStart > windowEnd) return []

  const startDateTime = DateTime.fromISO(windowStart, { zone: slot.timezone })
  let cursor = firstOnOrAfter(slot.weekday, startDateTime)

  const results: Occurrence[] = []

  while (cursor.toISODate()! <= windowEnd) {
    const originalDateISO = cursor.toISODate()!
    const override = overridesByDate.get(originalDateISO)

    if (override?.action !== 'cancelled') {
      const effectiveDate = override?.newDate ?? originalDateISO
      const effectiveTime = override?.newStartTime ?? slot.startTime
      const resolved = resolveWallClock(effectiveDate, effectiveTime, slot.timezone)

      results.push({
        slotId: slot.id,
        date: effectiveDate,
        start: resolved.dateTime,
        end: resolved.dateTime.plus({ minutes: slot.durationMinutes }),
        status: override ? 'moved' : 'scheduled',
        originalDate: override ? originalDateISO : null,
        note: override?.note ?? null,
        wallClockShifted: resolved.shifted,
      })
    }

    cursor = cursor.plus({ weeks: 1 })
  }

  results.sort((a, b) => a.start.toMillis() - b.start.toMillis())

  return results
}
