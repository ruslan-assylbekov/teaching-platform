import { describe, expect, it } from 'vitest'
import { findConflict } from './conflicts.ts'
import type { ClassSlot } from './expand.ts'

function slot(overrides: Partial<ClassSlot> = {}): ClassSlot {
  return {
    id: 'existing-1',
    weekday: 0,
    startTime: { hour: 17, minute: 0 },
    durationMinutes: 60,
    timezone: 'Asia/Almaty',
    activeFrom: '2026-01-01',
    activeUntil: null,
    ...overrides,
  }
}

describe('findConflict', () => {
  it('flags an exact same weekday/time overlap', () => {
    const existing = [slot()]
    const candidate = slot()

    expect(findConflict(candidate, existing)).toBe(existing[0])
  })

  it('flags a partial time overlap', () => {
    const existing = [slot({ startTime: { hour: 17, minute: 0 }, durationMinutes: 60 })]
    const candidate = slot({ startTime: { hour: 17, minute: 30 }, durationMinutes: 60 })

    expect(findConflict(candidate, existing)).toBe(existing[0])
  })

  it('does not flag back-to-back slots that only touch at the boundary', () => {
    const existing = [slot({ startTime: { hour: 17, minute: 0 }, durationMinutes: 60 })]
    const candidate = slot({ startTime: { hour: 18, minute: 0 }, durationMinutes: 60 })

    expect(findConflict(candidate, existing)).toBeNull()
  })

  it('does not flag different weekdays', () => {
    const existing = [slot({ weekday: 0 })]
    const candidate = slot({ weekday: 1 })

    expect(findConflict(candidate, existing)).toBeNull()
  })

  it('does not flag slots whose active ranges never overlap', () => {
    const existing = [slot({ activeFrom: '2020-01-01', activeUntil: '2020-12-31' })]
    const candidate = slot({ activeFrom: '2026-01-01', activeUntil: null })

    expect(findConflict(candidate, existing)).toBeNull()
  })

  it('flags a collision across different timezones once resolved to real instants', () => {
    // Asia/Almaty was UTC+6 in the reference week (ISO week 1 of 2024,
    // before Kazakhstan's March 2024 switch to a unified UTC+5), and
    // Europe/London is on plain GMT (UTC+0) that time of year, so 17:00
    // Asia/Almaty is the same instant as 11:00 Europe/London. Deliberately
    // not hand-computed from memory -- verified against Luxon itself,
    // exactly the trap this comparison exists to avoid making twice.
    const existing = [slot({ timezone: 'Asia/Almaty', startTime: { hour: 17, minute: 0 } })]
    const candidate = slot({ timezone: 'Europe/London', startTime: { hour: 11, minute: 0 } })

    expect(findConflict(candidate, existing)).toBe(existing[0])
  })

  it('returns the first conflicting slot among several existing slots', () => {
    const first = slot({ id: 'first', weekday: 2, startTime: { hour: 10, minute: 0 } })
    const second = slot({ id: 'second', weekday: 2, startTime: { hour: 17, minute: 0 } })
    const candidate = slot({ weekday: 2, startTime: { hour: 17, minute: 15 } })

    expect(findConflict(candidate, [first, second])).toBe(second)
  })
})
