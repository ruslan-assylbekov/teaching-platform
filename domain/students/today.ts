import { DateTime } from 'luxon'
import { env } from '../../lib/env.ts'
import * as scheduleDb from '../../db/queries/schedule.ts'
import type { StudentWithAccount } from '../../db/queries/students.ts'
import { expandOccurrences } from '../schedule/expand.ts'
import type { Occurrence } from '../schedule/expand.ts'
import { toClassOverride, toClassSlot } from '../schedule/mappers.ts'
import { listActiveStudents } from './directory.ts'

export type TodayClass = {
  student: StudentWithAccount
  occurrence: Occurrence
}

// Design spec §2: Today answers "what's happening today?" for the teacher.
// Searches a wide window and filters to today's resolved date (see the
// contract note in expand.ts) so a class rescheduled *into* today from
// another date still shows up, not just ones originally scheduled today.
export async function getTodayClasses(): Promise<TodayClass[]> {
  const students = await listActiveStudents()
  const now = DateTime.now().setZone(env.DEFAULT_TIMEZONE)
  const todayISO = now.toISODate()
  if (!todayISO) return []

  const searchRange = { from: now.minus({ days: 60 }), to: now.plus({ days: 60 }) }
  const results: TodayClass[] = []

  for (const student of students) {
    const slots = await scheduleDb.listSlotsForStudent(student.user_id, { role: 'teacher' })
    for (const slotRow of slots) {
      const overrides = await scheduleDb.listOverridesForSlot(slotRow.id)
      const occurrences = expandOccurrences(toClassSlot(slotRow), overrides.map(toClassOverride), searchRange)
      for (const occurrence of occurrences) {
        if (occurrence.date === todayISO) {
          results.push({ student, occurrence })
        }
      }
    }
  }

  results.sort((a, b) => a.occurrence.start.toMillis() - b.occurrence.start.toMillis())
  return results
}
