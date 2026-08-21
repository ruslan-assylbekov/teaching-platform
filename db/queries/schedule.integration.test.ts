import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { pool } from '../client.ts'
import {
  createOverride,
  createSlot,
  deleteOverride,
  deleteSlot,
  listAllActiveSlots,
  listOverridesForSlot,
  listSlotsForStudent,
  updateSlot,
} from './schedule.ts'
import { archive } from './students.ts'
import { create as createStudent } from './students.ts'
import { createStudentUser } from './users.ts'

function uniqueUsername(): string {
  return `test.${randomUUID()}`
}

const createdUserIds: string[] = []

async function makeStudent() {
  const user = await createStudentUser({ username: uniqueUsername(), passwordHash: 'hash' }, pool)
  createdUserIds.push(user.id)
  const student = await createStudent(
    {
      userId: user.id,
      fullName: 'Test Student',
      grade: '9',
      school: null,
      level: 'intermediate',
      objectives: null,
      privateNotes: null,
      parentPhone: null,
      parentName: null,
    },
    pool,
  )
  return { user, student }
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds])
    createdUserIds.length = 0
  }
})

afterAll(async () => {
  await pool.end()
})

describe('schedule queries', () => {
  it('creates a slot and lists it for its student (teacher context)', async () => {
    const { user } = await makeStudent()
    const slot = await createSlot({
      studentId: user.id,
      weekday: 0,
      startTime: '17:00',
      durationMinutes: 60,
      timezone: 'Asia/Almaty',
      activeFrom: '2026-01-01',
      activeUntil: null,
    })

    const slots = await listSlotsForStudent(user.id, { role: 'teacher' })
    expect(slots.map((s) => s.id)).toContain(slot.id)
    expect(slot.start_time).toBe('17:00:00')
    expect(slot.active_from).toBe('2026-01-01')
  })

  // Same isolation guarantee as students.ts's findById (design spec §3.4).
  it('returns nothing when a student requests another student\'s slots', async () => {
    const { user: owner } = await makeStudent()
    const { user: intruder } = await makeStudent()
    await createSlot({
      studentId: owner.id,
      weekday: 1,
      startTime: '18:00',
      durationMinutes: 45,
      timezone: 'Asia/Almaty',
      activeFrom: '2026-01-01',
      activeUntil: null,
    })

    const result = await listSlotsForStudent(owner.id, { role: 'student', userId: intruder.id })
    expect(result).toEqual([])
  })

  it('updates a slot', async () => {
    const { user } = await makeStudent()
    const slot = await createSlot({
      studentId: user.id,
      weekday: 2,
      startTime: '10:00',
      durationMinutes: 30,
      timezone: 'Asia/Almaty',
      activeFrom: '2026-01-01',
      activeUntil: null,
    })

    const updated = await updateSlot(slot.id, {
      weekday: 3,
      startTime: '11:00',
      durationMinutes: 45,
      timezone: 'Europe/London',
      activeFrom: '2026-02-01',
      activeUntil: '2026-12-31',
    })

    expect(updated).toMatchObject({
      weekday: 3,
      start_time: '11:00:00',
      duration_minutes: 45,
      timezone: 'Europe/London',
      active_from: '2026-02-01',
      active_until: '2026-12-31',
    })
  })

  it('deletes a slot', async () => {
    const { user } = await makeStudent()
    const slot = await createSlot({
      studentId: user.id,
      weekday: 4,
      startTime: '09:00',
      durationMinutes: 60,
      timezone: 'Asia/Almaty',
      activeFrom: '2026-01-01',
      activeUntil: null,
    })

    await deleteSlot(slot.id)

    const slots = await listSlotsForStudent(user.id, { role: 'teacher' })
    expect(slots.find((s) => s.id === slot.id)).toBeUndefined()
  })

  it('creates, lists, and deletes overrides, and upserts on (slot_id, original_date)', async () => {
    const { user } = await makeStudent()
    const slot = await createSlot({
      studentId: user.id,
      weekday: 5,
      startTime: '14:00',
      durationMinutes: 60,
      timezone: 'Asia/Almaty',
      activeFrom: '2026-01-01',
      activeUntil: null,
    })

    const cancelled = await createOverride({
      slotId: slot.id,
      originalDate: '2026-03-06',
      action: 'cancelled',
      newDate: null,
      newStartTime: null,
      note: null,
    })
    expect(cancelled.action).toBe('cancelled')

    // Changing your mind: same (slot, date) should update, not conflict.
    const changedToMoved = await createOverride({
      slotId: slot.id,
      originalDate: '2026-03-06',
      action: 'moved',
      newDate: '2026-03-08',
      newStartTime: '15:00',
      note: 'rescheduled',
    })
    expect(changedToMoved.id).toBe(cancelled.id)
    expect(changedToMoved.action).toBe('moved')
    expect(changedToMoved.new_date).toBe('2026-03-08')

    const overrides = await listOverridesForSlot(slot.id)
    expect(overrides).toHaveLength(1)

    await deleteOverride(changedToMoved.id)
    expect(await listOverridesForSlot(slot.id)).toHaveLength(0)
  })

  // Backs the master calendar's grid and the global (cross-student)
  // exclusivity check in domain/schedule/manage.ts -- an archived student's
  // slot must not still occupy a weekday/time for the rest of the roster.
  it('lists slots for every active student, excluding archived ones', async () => {
    const { user: activeUser, student: activeStudent } = await makeStudent()
    const { user: archivedUser } = await makeStudent()

    const activeSlot = await createSlot({
      studentId: activeUser.id,
      weekday: 0,
      startTime: '09:00',
      durationMinutes: 30,
      timezone: 'Asia/Almaty',
      activeFrom: '2026-01-01',
      activeUntil: null,
    })
    const archivedSlot = await createSlot({
      studentId: archivedUser.id,
      weekday: 1,
      startTime: '10:00',
      durationMinutes: 30,
      timezone: 'Asia/Almaty',
      activeFrom: '2026-01-01',
      activeUntil: null,
    })
    await archive(archivedUser.id)

    const slots = await listAllActiveSlots()
    const ids = slots.map((s) => s.id)
    expect(ids).toContain(activeSlot.id)
    expect(ids).not.toContain(archivedSlot.id)
    expect(slots.find((s) => s.id === activeSlot.id)?.student_full_name).toBe(activeStudent.full_name)
  })
})
