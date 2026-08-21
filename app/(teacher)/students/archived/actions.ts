'use server'

import { revalidatePath } from 'next/cache'
import { unarchiveStudent } from '../../../../domain/students/manage.ts'

export async function unarchiveAction(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') ?? '')
  if (!userId) return

  await unarchiveStudent(userId)
  revalidatePath('/students/archived')
  revalidatePath('/', 'layout')
}
