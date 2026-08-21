import { cache } from 'react'
import * as studentsDb from '../../db/queries/students.ts'
import type { StudentWithAccount } from '../../db/queries/students.ts'

// Memoized per request: the teacher layout's sidebar and the Today page
// both need the active student list on every request.
export const listActiveStudents = cache(async (): Promise<StudentWithAccount[]> => {
  return studentsDb.listActive()
})

export async function listArchivedStudents(): Promise<StudentWithAccount[]> {
  return studentsDb.listArchived()
}
