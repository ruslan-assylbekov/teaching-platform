'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSlot, deleteSlot, saveOverride, updateSlot } from '../../../../domain/schedule/manage.ts'
import type { SlotInput } from '../../../../domain/schedule/manage.ts'

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

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

// A conflict needs to name the colliding slot (design spec §5.4), which
// doesn't fit neatly in a single query-param error code the way login's
// generic "invalid" does -- encode the conflicting slot's weekday + time
// directly and let the page translate them back into a message.
function conflictRedirect(studentId: string, conflict: { weekday: number; startTime: { hour: number; minute: number } }): never {
  const params = new URLSearchParams({
    tab: 'schedule',
    conflictWeekday: String(conflict.weekday),
    conflictTime: `${pad(conflict.startTime.hour)}:${pad(conflict.startTime.minute)}`,
  })
  redirect(`/students/${studentId}?${params.toString()}`)
}

export async function createSlotAction(studentId: string, formData: FormData): Promise<void> {
  const input = parseSlotForm(formData)
  const result = await createSlot(studentId, input)
  if (!result.ok) conflictRedirect(studentId, result.conflict)
  revalidatePath(`/students/${studentId}`)
}

export async function updateSlotAction(slotId: string, studentId: string, formData: FormData): Promise<void> {
  const input = parseSlotForm(formData)
  const result = await updateSlot(slotId, studentId, input)
  if (!result.ok) conflictRedirect(studentId, result.conflict)
  revalidatePath(`/students/${studentId}`)
}

export async function deleteSlotAction(slotId: string, studentId: string): Promise<void> {
  await deleteSlot(slotId)
  revalidatePath(`/students/${studentId}`)
}

export async function cancelOccurrenceAction(studentId: string, formData: FormData): Promise<void> {
  const slotId = String(formData.get('slotId'))
  const originalDate = String(formData.get('originalDate'))
  await saveOverride({ slotId, originalDate, action: 'cancelled', newDate: null, newStartTime: null, note: null })
  revalidatePath(`/students/${studentId}`)
}

export async function moveOccurrenceAction(studentId: string, formData: FormData): Promise<void> {
  const slotId = String(formData.get('slotId'))
  const originalDate = String(formData.get('originalDate'))
  const newDate = String(formData.get('newDate') ?? '').trim() || null
  const newStartTime = String(formData.get('newStartTime') ?? '').trim() || null
  const note = String(formData.get('note') ?? '').trim() || null
  await saveOverride({ slotId, originalDate, action: 'moved', newDate, newStartTime, note })
  revalidatePath(`/students/${studentId}`)
}
