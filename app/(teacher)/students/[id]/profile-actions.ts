'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  archiveStudent,
  deleteStudent,
  getStudentDetail,
  unarchiveStudent,
  updateStudentProfile,
} from '../../../../domain/students/manage.ts'
import { reissueCredentials } from '../../../../domain/students/onboarding.ts'

export async function updateProfileAction(studentId: string, formData: FormData): Promise<void> {
  const fullName = String(formData.get('fullName') ?? '').trim()
  const grade = String(formData.get('grade') ?? '').trim()
  const school = String(formData.get('school') ?? '').trim() || null
  const level = String(formData.get('level') ?? '').trim()
  const objectives = String(formData.get('objectives') ?? '').trim() || null
  const privateNotes = String(formData.get('privateNotes') ?? '').trim() || null
  const parentPhone = String(formData.get('parentPhone') ?? '').trim() || null
  const parentName = String(formData.get('parentName') ?? '').trim() || null

  await updateStudentProfile(studentId, {
    fullName,
    grade,
    school,
    level,
    objectives,
    privateNotes,
    parentPhone,
    parentName,
  })
  revalidatePath(`/students/${studentId}`)
  revalidatePath('/', 'layout')
}

// Stays on the same detail page rather than redirecting -- the teacher can
// see the archived/restored state take effect immediately and undo it
// right there (findByIdWithAccount still resolves an archived student).
export async function archiveAction(studentId: string): Promise<void> {
  await archiveStudent(studentId)
  revalidatePath(`/students/${studentId}`)
  revalidatePath('/', 'layout')
}

export async function unarchiveAction(studentId: string): Promise<void> {
  await unarchiveStudent(studentId)
  revalidatePath(`/students/${studentId}`)
  revalidatePath('/', 'layout')
}

// The student no longer exists after this -- redirect away, unlike
// archive/unarchive.
export async function deleteAction(studentId: string, formData: FormData): Promise<void> {
  const confirmation = String(formData.get('confirmation') ?? '').trim()
  const student = await getStudentDetail(studentId)

  if (!student || confirmation !== student.full_name) {
    redirect(`/students/${studentId}?deleteError=1`)
  }

  await deleteStudent(studentId)
  revalidatePath('/', 'layout')
  redirect('/students')
}

// Same "must show a secret exactly once" constraint as onboarding's create
// flow -- can't redirect with it in the URL, so this is useActionState-
// shaped (called from the client component ReissueButton.tsx) rather than
// a plain form action.
export type ReissueState = { status: 'idle' } | { status: 'success'; oneTimePassword: string }

export async function reissueAction(studentId: string, _prevState: ReissueState, _formData: FormData): Promise<ReissueState> {
  const result = await reissueCredentials(studentId)
  revalidatePath(`/students/${studentId}`)
  return { status: 'success', oneTimePassword: result.oneTimePassword }
}
