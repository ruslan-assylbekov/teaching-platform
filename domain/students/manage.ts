import * as studentsDb from '../../db/queries/students.ts'
import type { StudentAccessContext, StudentRow, StudentWithAccount } from '../../db/queries/students.ts'

export async function getStudentProfile(studentId: string, context: StudentAccessContext): Promise<StudentRow | null> {
  return studentsDb.findById(studentId, context)
}

// Teacher-only detail view: profile plus username/status, for the archive
// vs. restore decision on the student detail page.
export async function getStudentDetail(studentId: string): Promise<StudentWithAccount | null> {
  return studentsDb.findByIdWithAccount(studentId)
}

export type UpdateProfileInput = {
  fullName: string
  grade: string
  school: string | null
  level: string
  objectives: string | null
  privateNotes: string | null
  parentPhone: string | null
  parentName: string | null
}

export async function updateStudentProfile(studentId: string, fields: UpdateProfileInput): Promise<StudentRow | null> {
  return studentsDb.update(studentId, fields)
}

export async function archiveStudent(studentId: string): Promise<void> {
  await studentsDb.archive(studentId)
}

export async function unarchiveStudent(studentId: string): Promise<void> {
  await studentsDb.unarchive(studentId)
}

export async function deleteStudent(studentId: string): Promise<void> {
  await studentsDb.remove(studentId)
}
