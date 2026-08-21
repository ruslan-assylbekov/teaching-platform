import { DateTime } from 'luxon'
import type { ClassSlot } from './expand.ts'

// Design spec §5.4: "Two overlapping class slots -> rejected at save,
// naming the conflicting slot." Pure, like expand.ts -- imports nothing
// but Luxon and expand.ts's types.

type Candidate = Omit<ClassSlot, 'id'>

function activeRangesOverlap(a: Candidate, b: Candidate): boolean {
  const aEnd = a.activeUntil ?? '9999-12-31'
  const bEnd = b.activeUntil ?? '9999-12-31'
  return a.activeFrom <= bEnd && b.activeFrom <= aEnd
}

// Both patterns repeat identically every week they're active, so comparing
// them within a single shared reference week is representative of every
// week both are active. ISO week-date construction (rather than a
// hardcoded calendar date) guarantees this really is a Monday, verified by
// Luxon itself rather than relied on from memory.
function resolveInReferenceWeek(candidate: Candidate): { start: DateTime; end: DateTime } {
  const monday = DateTime.fromObject({ weekYear: 2024, weekNumber: 1, weekday: 1 }, { zone: candidate.timezone })
  const day = monday.plus({ days: candidate.weekday })
  const start = day.set({
    hour: candidate.startTime.hour,
    minute: candidate.startTime.minute,
    second: 0,
    millisecond: 0,
  })
  return { start, end: start.plus({ minutes: candidate.durationMinutes }) }
}

// Returns the first existing slot the candidate collides with, or null.
// Existing slots in a different timezone are still compared correctly --
// both are resolved to real instants in the shared reference week before
// comparing.
export function findConflict<T extends Candidate>(candidate: Candidate, existing: T[]): T | null {
  const candidateInterval = resolveInReferenceWeek(candidate)

  for (const other of existing) {
    if (!activeRangesOverlap(candidate, other)) continue

    const otherInterval = resolveInReferenceWeek(other)
    const overlaps = candidateInterval.start < otherInterval.end && otherInterval.start < candidateInterval.end
    if (overlaps) return other
  }

  return null
}
