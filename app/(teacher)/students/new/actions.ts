'use server'

import { revalidatePath } from 'next/cache'
import { onboardStudent } from '../../../../domain/students/onboarding.ts'

export type CreateStudentState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'required' }
  | { status: 'success'; username: string; oneTimePassword: string; studentId: string }

export async function createStudentAction(
  _prevState: CreateStudentState,
  formData: FormData,
): Promise<CreateStudentState> {
  const fullName = String(formData.get('fullName') ?? '').trim()
  const grade = String(formData.get('grade') ?? '').trim()
  const school = String(formData.get('school') ?? '').trim() || null
  const level = String(formData.get('level') ?? '').trim()
  const objectives = String(formData.get('objectives') ?? '').trim() || null
  const privateNotes = String(formData.get('privateNotes') ?? '').trim() || null
  const parentPhone = String(formData.get('parentPhone') ?? '').trim() || null
  const parentName = String(formData.get('parentName') ?? '').trim() || null

  if (!fullName || !grade || !level) {
    return { status: 'error', messageKey: 'required' }
  }

  const result = await onboardStudent({
    fullName,
    grade,
    school,
    level,
    objectives,
    privateNotes,
    parentPhone,
    parentName,
  })

  revalidatePath('/', 'layout')

  return {
    status: 'success',
    username: result.user.username,
    oneTimePassword: result.oneTimePassword,
    studentId: result.user.id,
  }
}
