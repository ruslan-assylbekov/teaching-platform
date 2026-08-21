'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSlot, deleteSlot, saveOverride, updateSlot } from '../../../domain/schedule/manage.ts'
import type { SlotInput } from '../../../domain/schedule/manage.ts'
import { withToast } from '../../../lib/toast.ts'

function gridUrl(week: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ week, ...extra })
  return `/schedule?${params.toString()}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

// Mirrors the old per-student ScheduleTab's conflictRedirect, extended to
// also name the other student now that exclusivity is global (design spec
// §5.4 + this feature's "one student per slot" decision).
function conflictRedirect(week: string, conflict: { studentName: string; weekday: number; startTime: { hour: number; minute: number } }): never {
  redirect(
    gridUrl(week, {
      conflictName: conflict.studentName,
      conflictWeekday: String(conflict.weekday),
      conflictTime: `${pad(conflict.startTime.hour)}:${pad(conflict.startTime.minute)}`,
    }),
  )
}

function parseSlotForm(formData: FormData): SlotInput {
  return {
    weekday: Number(formData.get('weekday')),
    startTime: String(formData.get('startTime')),
    durationMinutes: Number(formData.get('durationMinutes')),
    timezone: String(formData.get('timezone')),
    activeFrom: String(formData.get('activeFrom')),
    activeUntil: String(formData.get('activeUntil') ?? '').trim() || null,
  }
}

export async function createSlotAction(formData: FormData): Promise<void> {
  const week = String(formData.get('week'))
  const studentId = String(formData.get('studentId'))
  const input = parseSlotForm(formData)

  const result = await createSlot(studentId, input)
  if (!result.ok) conflictRedirect(week, result.conflict)

  revalidatePath('/schedule')
  redirect(withToast(gridUrl(week), 'slotSaved'))
}

export async function updateSlotAction(formData: FormData): Promise<void> {
  const week = String(formData.get('week'))
  const slotId = String(formData.get('slotId'))
  const input = parseSlotForm(formData)

  const result = await updateSlot(slotId, input)
  if (!result.ok) conflictRedirect(week, result.conflict)

  revalidatePath('/schedule')
  redirect(withToast(gridUrl(week), 'slotSaved'))
}

export async function deleteSlotAction(formData: FormData): Promise<void> {
  const week = String(formData.get('week'))
  const slotId = String(formData.get('slotId'))

  await deleteSlot(slotId)
  revalidatePath('/schedule')
  redirect(withToast(gridUrl(week), 'slotDeleted'))
}

export async function cancelOccurrenceAction(formData: FormData): Promise<void> {
  const week = String(formData.get('week'))
  const slotId = String(formData.get('slotId'))
  const originalDate = String(formData.get('originalDate'))

  await saveOverride({ slotId, originalDate, action: 'cancelled', newDate: null, newStartTime: null, note: null })
  revalidatePath('/schedule')
  redirect(withToast(gridUrl(week), 'lessonCancelled'))
}

export async function moveOccurrenceAction(formData: FormData): Promise<void> {
  const week = String(formData.get('week'))
  const slotId = String(formData.get('slotId'))
  const originalDate = String(formData.get('originalDate'))
  const newDate = String(formData.get('newDate') ?? '').trim() || null
  const newStartTime = String(formData.get('newStartTime') ?? '').trim() || null
  const note = String(formData.get('note') ?? '').trim() || null

  await saveOverride({ slotId, originalDate, action: 'moved', newDate, newStartTime, note })
  revalidatePath('/schedule')
  redirect(withToast(gridUrl(week), 'lessonMoved'))
}
