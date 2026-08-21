import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { expandOccurrences } from './expand.ts'
import type { ClassOverride, ClassSlot } from './expand.ts'

function baseSlot(overrides: Partial<ClassSlot> = {}): ClassSlot {
  return {
    id: 'slot-1',
    weekday: 0,
    startTime: { hour: 17, minute: 0 },
    durationMinutes: 60,
    timezone: 'Asia/Almaty',
    activeFrom: '2026-01-01',
    activeUntil: null,
    ...overrides,
  }
}

describe('expandOccurrences — basic weekly generation', () => {
  it('generates one occurrence per week on the configured weekday', () => {
    const activeFrom = DateTime.fromISO('2026-01-05', { zone: 'Asia/Almaty' }) // a Monday
    const slot = baseSlot({ weekday: activeFrom.weekday - 1, activeFrom: activeFrom.toISODate()! })

    const results = expandOccurrences(slot, [], {
      from: activeFrom,
      to: activeFrom.plus({ weeks: 3 }),
    })

    expect(results.map((o) => o.date)).toEqual([
      activeFrom.toISODate(),
      activeFrom.plus({ weeks: 1 }).toISODate(),
      activeFrom.plus({ weeks: 2 }).toISODate(),
      activeFrom.plus({ weeks: 3 }).toISODate(),
    ])
    expect(results.every((o) => o.status === 'scheduled')).toBe(true)
    expect(results.every((o) => o.wallClockShifted === false)).toBe(true)
  })

  it('excludes occurrences outside the requested range', () => {
    const activeFrom = DateTime.fromISO('2026-01-05', { zone: 'Asia/Almaty' })
    const slot = baseSlot({ weekday: activeFrom.weekday - 1, activeFrom: activeFrom.toISODate()! })

    const results = expandOccurrences(slot, [], {
      from: activeFrom.plus({ days: 1 }),
      to: activeFrom.plus({ weeks: 1, days: -1 }),
    })

    expect(results).toEqual([])
  })
})

describe('expandOccurrences — pattern ending mid-week', () => {
  it('stops generating once activeUntil is passed, even mid-range', () => {
    const activeFrom = DateTime.fromISO('2026-01-05', { zone: 'Asia/Almaty' })
    const weekday = activeFrom.weekday - 1
    const occ2 = activeFrom.plus({ weeks: 1 })
    const occ3 = activeFrom.plus({ weeks: 2 })
    // Cuts off between the 2nd and 3rd occurrence, mid-week relative to the pattern.
    const activeUntil = occ2.plus({ days: 3 })

    const slot = baseSlot({
      weekday,
      activeFrom: activeFrom.toISODate()!,
      activeUntil: activeUntil.toISODate(),
    })

    const results = expandOccurrences(slot, [], {
      from: activeFrom.minus({ days: 5 }),
      to: occ3.plus({ weeks: 2 }),
    })

    expect(results.map((o) => o.date)).toEqual([activeFrom.toISODate(), occ2.toISODate()])
  })
})

describe('expandOccurrences — overrides', () => {
  it('removes a cancelled occurrence', () => {
    const activeFrom = DateTime.fromISO('2026-01-05', { zone: 'Asia/Almaty' })
    const weekday = activeFrom.weekday - 1
    const slot = baseSlot({ weekday, activeFrom: activeFrom.toISODate()! })
    const cancelledDate = activeFrom.plus({ weeks: 1 }).toISODate()!

    const overrides: ClassOverride[] = [
      { slotId: slot.id, originalDate: cancelledDate, action: 'cancelled', newDate: null, newStartTime: null, note: null },
    ]

    const results = expandOccurrences(slot, overrides, {
      from: activeFrom,
      to: activeFrom.plus({ weeks: 2 }),
    })

    expect(results.map((o) => o.date)).toEqual([activeFrom.toISODate(), activeFrom.plus({ weeks: 2 }).toISODate()])
  })

  it('reports a moved occurrence at its new date/time with originalDate set', () => {
    const activeFrom = DateTime.fromISO('2026-01-05', { zone: 'Asia/Almaty' })
    const weekday = activeFrom.weekday - 1
    const slot = baseSlot({ weekday, activeFrom: activeFrom.toISODate()! })
    const originalDate = activeFrom.toISODate()!
    const newDate = activeFrom.plus({ days: 2 }).toISODate()!

    const overrides: ClassOverride[] = [
      {
        slotId: slot.id,
        originalDate,
        action: 'moved',
        newDate,
        newStartTime: { hour: 19, minute: 30 },
        note: 'moved at student request',
      },
    ]

    const results = expandOccurrences(slot, overrides, {
      from: activeFrom,
      to: activeFrom.plus({ weeks: 1 }),
    })

    const moved = results.find((o) => o.originalDate === originalDate)
    expect(moved).toBeDefined()
    expect(moved!.date).toBe(newDate)
    expect(moved!.status).toBe('moved')
    expect(moved!.start.hour).toBe(19)
    expect(moved!.start.minute).toBe(30)
    expect(moved!.note).toBe('moved at student request')
  })

  it('an override with no matching base occurrence is inert, not an error', () => {
    const activeFrom = DateTime.fromISO('2026-01-05', { zone: 'Asia/Almaty' })
    const weekday = activeFrom.weekday - 1
    const slot = baseSlot({ weekday, activeFrom: activeFrom.toISODate()! })

    // A cancellation for a date that was never a real occurrence of this
    // pattern (wrong weekday, and outside activeFrom anyway).
    const overrides: ClassOverride[] = [
      { slotId: slot.id, originalDate: '2020-01-01', action: 'cancelled', newDate: null, newStartTime: null, note: null },
    ]

    const results = expandOccurrences(slot, overrides, {
      from: activeFrom,
      to: activeFrom.plus({ weeks: 1 }),
    })

    expect(results).toHaveLength(2)
  })

  it('a moved-into occurrence lands cleanly even when its destination date has its own cancelled override', () => {
    // Weekly slot with two consecutive occurrences, occA and occB. occA is
    // moved onto occB's date; occB's own regular occurrence is separately
    // cancelled. Each original date is processed independently against its
    // own override, so the result should be exactly one occurrence on
    // occB's date (the moved one), not zero and not two.
    const activeFrom = DateTime.fromISO('2026-01-05', { zone: 'Asia/Almaty' })
    const weekday = activeFrom.weekday - 1
    const slot = baseSlot({ weekday, activeFrom: activeFrom.toISODate()! })
    const occADate = activeFrom.toISODate()!
    const occBDate = activeFrom.plus({ weeks: 1 }).toISODate()!

    const overrides: ClassOverride[] = [
      { slotId: slot.id, originalDate: occADate, action: 'moved', newDate: occBDate, newStartTime: null, note: null },
      { slotId: slot.id, originalDate: occBDate, action: 'cancelled', newDate: null, newStartTime: null, note: null },
    ]

    const results = expandOccurrences(slot, overrides, {
      from: activeFrom,
      to: activeFrom.plus({ weeks: 2 }),
    })

    const onOccBDate = results.filter((o) => o.date === occBDate)
    expect(onOccBDate).toHaveLength(1)
    expect(onOccBDate[0]!.status).toBe('moved')
    expect(onOccBDate[0]!.originalDate).toBe(occADate)
  })

  it('cancelling a past occurrence is still allowed (no special-casing here — that flag is UI-level, spec §5.4)', () => {
    const activeFrom = DateTime.fromISO('2026-01-05', { zone: 'Asia/Almaty' })
    const weekday = activeFrom.weekday - 1
    const slot = baseSlot({ weekday, activeFrom: activeFrom.toISODate()! })
    const pastDate = activeFrom.toISODate()!

    const overrides: ClassOverride[] = [
      { slotId: slot.id, originalDate: pastDate, action: 'cancelled', newDate: null, newStartTime: null, note: null },
    ]

    const results = expandOccurrences(slot, overrides, {
      from: activeFrom,
      to: activeFrom.plus({ weeks: 1 }),
    })

    expect(results.map((o) => o.date)).toEqual([activeFrom.plus({ weeks: 1 }).toISODate()])
  })
})

describe('expandOccurrences — daylight saving (Europe/London fixture, spec §7.6/§7.2)', () => {
  it('flags and shifts forward a wall-clock time that does not exist (2026-03-29 spring-forward gap)', () => {
    // Verified in the design spec §7.2: 01:30 on 2026-03-29 in Europe/London
    // does not exist and Luxon silently resolves it to 02:30+01:00.
    const gapDate = DateTime.fromISO('2026-03-29', { zone: 'Europe/London' })
    expect(gapDate.weekday).toBe(7) // Sunday, so weekday0to6 = 6

    const slot = baseSlot({
      weekday: 6,
      startTime: { hour: 1, minute: 30 },
      timezone: 'Europe/London',
      activeFrom: gapDate.toISODate()!,
    })

    const results = expandOccurrences(slot, [], {
      from: gapDate,
      to: gapDate,
    })

    expect(results).toHaveLength(1)
    const occurrence = results[0]!
    expect(occurrence.wallClockShifted).toBe(true)
    expect(occurrence.start.hour).toBe(2)
    expect(occurrence.start.minute).toBe(30)
    expect(occurrence.start.offset).toBe(60) // +01:00
  })

  it('resolves an ambiguous wall-clock time to the earlier offset (2026-10-25 autumn fall-back)', () => {
    // Verified in the design spec §7.2: 01:30 on 2026-10-25 occurs twice;
    // Luxon's default resolves to the earlier (+01:00) offset.
    const ambiguousDate = DateTime.fromISO('2026-10-25', { zone: 'Europe/London' })
    expect(ambiguousDate.weekday).toBe(7) // Sunday

    const slot = baseSlot({
      weekday: 6,
      startTime: { hour: 1, minute: 30 },
      timezone: 'Europe/London',
      activeFrom: ambiguousDate.toISODate()!,
    })

    const results = expandOccurrences(slot, [], {
      from: ambiguousDate,
      to: ambiguousDate,
    })

    expect(results).toHaveLength(1)
    const occurrence = results[0]!
    expect(occurrence.wallClockShifted).toBe(false)
    expect(occurrence.start.hour).toBe(1)
    expect(occurrence.start.minute).toBe(30)
    expect(occurrence.start.offset).toBe(60) // +01:00, the earlier offset
  })
})

describe('expandOccurrences — purity / no hidden state', () => {
  it('always reflects the slot object passed in, never a cached prior version', () => {
    const activeFrom = DateTime.fromISO('2026-01-05', { zone: 'Asia/Almaty' })
    const weekday = activeFrom.weekday - 1
    const range = { from: activeFrom, to: activeFrom }

    const before = expandOccurrences(baseSlot({ weekday, activeFrom: activeFrom.toISODate()!, startTime: { hour: 17, minute: 0 } }), [], range)
    const after = expandOccurrences(baseSlot({ weekday, activeFrom: activeFrom.toISODate()!, startTime: { hour: 18, minute: 30 } }), [], range)

    expect(before[0]!.start.hour).toBe(17)
    expect(after[0]!.start.hour).toBe(18)
    expect(after[0]!.start.minute).toBe(30)
  })
})
