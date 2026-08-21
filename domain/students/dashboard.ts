import { DateTime } from 'luxon'
import { env } from '../../lib/env.ts'
import * as scheduleDb from '../../db/queries/schedule.ts'
import * as studentsDb from '../../db/queries/students.ts'
import type { StudentAccessContext } from '../../db/queries/students.ts'
import { expandOccurrences } from '../schedule/expand.ts'
import type { Occurrence } from '../schedule/expand.ts'
import { toClassOverride, toClassSlot } from '../schedule/mappers.ts'

// Design spec §5.1 -- enough to answer "what's coming up" without
// over-fetching. Not a spec-mandated number; revisit if the student page's
// design ever wants a longer or shorter look-ahead.
const UPCOMING_HORIZON_DAYS = 14

// Teacher-only fields (private_notes, parent_phone, parent_name) are
// deliberately absent from this shape -- design spec §4.2 requires they
// never reach a student client, and the simplest way to guarantee that is
// to never put them in the object a student-facing page can render.
export type StudentDashboard = {
  fullName: string
  grade: string
  school: string | null
  level: string
  objectives: string | null
  startedAt: string
  occurrences: Occurrence[]
}

// The worked request-flow example in design spec §3.5: composes the
// profile query and the schedule query, runs occurrence expansion, returns
// a plain object. domain/ may call db/ per the layering note in the Phase
// 1 plan index; this returns data, never JSX.
export async function getStudentDashboard(
  studentId: string,
  context: StudentAccessContext,
): Promise<StudentDashboard | null> {
  const student = await studentsDb.findById(studentId, context)
  if (!student) return null

  const slots = await scheduleDb.listSlotsForStudent(studentId, context)

  // "Today" is anchored to the deployment's default timezone (design spec
  // §7.6) rather than the caller's -- reasonable for a single-region solo
  // tutor; individual slots still carry and resolve through their own zone.
  const now = DateTime.now().setZone(env.DEFAULT_TIMEZONE)

  // expand.ts iterates a slot's weekly cadence within `range` and only
  // then applies whichever override exists for each visited date -- a
  // class whose *original* date falls outside `range` never gets visited
  // at all, even if a `moved` override sends it into the window we care
  // about (documented as a known scope boundary in expand.ts itself).
  // Searching a wider window and filtering by the resolved date afterward
  // keeps that reschedule visible without expand.ts needing to know
  // anything about "moved from outside."
  const searchRange = { from: now.minus({ days: 60 }), to: now.plus({ days: UPCOMING_HORIZON_DAYS }) }

  const occurrenceLists = await Promise.all(
    slots.map(async (slotRow) => {
      const overrideRows = await scheduleDb.listOverridesForSlot(slotRow.id)
      return expandOccurrences(toClassSlot(slotRow), overrideRows.map(toClassOverride), searchRange)
    }),
  )

  const occurrences = occurrenceLists
    .flat()
    .filter((o) => o.start >= now)
    .sort((a, b) => a.start.toMillis() - b.start.toMillis())

  return {
    fullName: student.full_name,
    grade: student.grade,
    school: student.school,
    level: student.level,
    objectives: student.objectives,
    startedAt: student.started_at,
    occurrences,
  }
}
