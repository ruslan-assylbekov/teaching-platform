'use client'

import { useState, useTransition } from 'react'
import { DateTime } from 'luxon'
import { useTranslations } from 'next-intl'
import {
  cancelOccurrenceAction,
  createSlotAction,
  deleteSlotAction,
  moveOccurrenceAction,
  updateSlotAction,
} from '../../app/(teacher)/schedule/actions.ts'
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx'
import { Modal } from '../ui/Modal.tsx'

const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

export type GridTimeView = { hour: number; minute: number }

export type GridCellView = {
  slotId: string
  studentId: string
  studentName: string
  weekday: number
  time: GridTimeView
  durationMinutes: number
  timezone: string
  activeFrom: string
  activeUntil: string | null
  status: 'scheduled' | 'moved' | 'cancelled'
  date: string
  originalDate: string | null
  note: string | null
}

export type WeekGridView = {
  weekStart: string
  rows: GridTimeView[]
  cells: GridCellView[]
}

type RosterStudent = { id: string; name: string }

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatTime(t: GridTimeView): string {
  return `${pad(t.hour)}:${pad(t.minute)}`
}

function cellKey(weekday: number, time: GridTimeView): string {
  return `${weekday}-${formatTime(time)}`
}

export function WeekCalendarGrid({
  weekGrid,
  week,
  mode,
  students,
  defaultTimezone,
}: {
  weekGrid: WeekGridView
  week: string
  mode: 'teacher' | 'student'
  students?: RosterStudent[]
  defaultTimezone: string
}) {
  const t = useTranslations('Schedule')
  const tWeekday = useTranslations('Weekday')
  const tGrid = useTranslations('TeacherSchedule')
  const [, startTransition] = useTransition()

  const [emptyCell, setEmptyCell] = useState<{ weekday: number; time: GridTimeView } | null>(null)
  const [pickedStudent, setPickedStudent] = useState<RosterStudent | null>(null)
  const [activeCell, setActiveCell] = useState<GridCellView | null>(null)
  const [confirming, setConfirming] = useState<'cancel' | 'deleteSlot' | null>(null)

  const cellMap = new Map<string, GridCellView>()
  for (const cell of weekGrid.cells) cellMap.set(cellKey(cell.weekday, cell.time), cell)

  // Every successful mutation (this component's own actions, or a week-nav
  // Link) lands here as a fresh weekGrid prop from the server. Any modal
  // left open at that point is showing a stale snapshot -- e.g. an
  // occurrence that's now cancelled would still render its old "Cancel"/
  // "Move" controls -- so close everything rather than let stale state
  // linger across the redirect. Adjusted during render (React's recommended
  // pattern for "reset state when a prop changes") rather than in a
  // useEffect, which would cost an extra commit.
  const [prevWeekGrid, setPrevWeekGrid] = useState(weekGrid)
  if (weekGrid !== prevWeekGrid) {
    setPrevWeekGrid(weekGrid)
    setActiveCell(null)
    setEmptyCell(null)
    setPickedStudent(null)
    setConfirming(null)
  }

  function closeEmptyModal() {
    setEmptyCell(null)
    setPickedStudent(null)
  }

  function closeOccurrenceModal() {
    setActiveCell(null)
    setConfirming(null)
  }

  function runAction(action: (formData: FormData) => Promise<void>, fields: Record<string, string>) {
    const formData = new FormData()
    for (const [key, value] of Object.entries(fields)) formData.set(key, value)
    startTransition(() => {
      void action(formData)
    })
  }

  function confirmCancel() {
    if (!activeCell) return
    runAction(cancelOccurrenceAction, { week, slotId: activeCell.slotId, originalDate: activeCell.originalDate ?? activeCell.date })
  }

  function confirmDeleteSlot() {
    if (!activeCell) return
    runAction(deleteSlotAction, { week, slotId: activeCell.slotId })
  }

  return (
    <>
      <div className="schedule-grid-wrap">
        <table className="schedule-grid">
          <thead>
            <tr>
              <th scope="col" />
              {WEEKDAY_KEYS.map((key, weekday) => (
                <th scope="col" key={key}>
                  <div>{tWeekday(key)}</div>
                  <div className="hint-text">{DateTime.fromISO(weekGrid.weekStart).plus({ days: weekday }).toISODate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekGrid.rows.map((rowTime) => (
              <tr key={formatTime(rowTime)}>
                <th scope="row">{formatTime(rowTime)}</th>
                {WEEKDAY_KEYS.map((key, weekday) => {
                  const cell = cellMap.get(cellKey(weekday, rowTime))
                  if (cell) {
                    return (
                      <td key={key}>
                        <button type="button" className={`grid-cell grid-cell-${cell.status}`} onClick={() => setActiveCell(cell)}>
                          <span>{mode === 'teacher' ? cell.studentName : t('classLabel')}</span>
                          {cell.status === 'moved' && <span className="badge badge-moved">{t('statusMoved')}</span>}
                          {cell.status === 'cancelled' && <span className="badge badge-cancelled">{t('statusCancelled')}</span>}
                        </button>
                      </td>
                    )
                  }
                  if (mode === 'teacher') {
                    return (
                      <td key={key}>
                        <button
                          type="button"
                          className="grid-cell grid-cell-empty"
                          aria-label={tGrid('pickStudent')}
                          onClick={() => setEmptyCell({ weekday, time: rowTime })}
                        >
                          +
                        </button>
                      </td>
                    )
                  }
                  return <td key={key} />
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode === 'teacher' && (
        <Modal open={emptyCell !== null} onClose={closeEmptyModal}>
          {emptyCell && !pickedStudent && (
            <div>
              <h2>{tGrid('pickStudent')}</h2>
              <ul className="roster-list">
                {(students ?? []).map((student) => (
                  <li key={student.id}>
                    <button type="button" className="button-secondary" onClick={() => setPickedStudent(student)}>
                      {student.name}
                    </button>
                  </li>
                ))}
              </ul>
              {(students ?? []).length === 0 && <p className="hint-text">{tGrid('noActiveStudents')}</p>}
            </div>
          )}
          {emptyCell && pickedStudent && (
            <form action={createSlotAction}>
              <h2>{tGrid('newSlotFor', { name: pickedStudent.name })}</h2>
              <input type="hidden" name="week" value={week} />
              <input type="hidden" name="studentId" value={pickedStudent.id} />
              <input type="hidden" name="weekday" value={emptyCell.weekday} />
              <input type="hidden" name="startTime" value={formatTime(emptyCell.time)} />
              <div className="field">
                <label className="label" htmlFor="durationMinutes">
                  {t('duration')}
                </label>
                <input id="durationMinutes" name="durationMinutes" type="number" min={1} defaultValue={60} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="timezone">
                  {t('timezone')}
                </label>
                <input id="timezone" name="timezone" type="text" defaultValue={defaultTimezone} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="activeFrom">
                  {t('activeFrom')}
                </label>
                <input id="activeFrom" name="activeFrom" type="date" defaultValue={weekGrid.weekStart} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="activeUntil">
                  {t('activeUntil')}
                </label>
                <input id="activeUntil" name="activeUntil" type="date" />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="button-secondary" onClick={() => setPickedStudent(null)}>
                  {tGrid('back')}
                </button>
                <button type="submit" className="button">
                  {t('save')}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      <Modal open={activeCell !== null} onClose={closeOccurrenceModal}>
        {activeCell && (
          <div>
            <h2>{activeCell.studentName}</h2>
            <p>
              {activeCell.date} {formatTime(activeCell.time)}
              {activeCell.status === 'moved' && (
                <>
                  {' '}
                  <span className="badge badge-moved">{t('statusMoved')}</span>
                </>
              )}
              {activeCell.status === 'cancelled' && (
                <>
                  {' '}
                  <span className="badge badge-cancelled">{t('statusCancelled')}</span>
                </>
              )}
            </p>
            {activeCell.note && <p className="hint-text">{activeCell.note}</p>}

            {mode === 'teacher' && activeCell.status !== 'cancelled' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button type="button" className="button-secondary" onClick={() => setConfirming('cancel')}>
                  {t('cancelAction')}
                </button>

                <details>
                  <summary>{t('moveAction')}</summary>
                  <form action={moveOccurrenceAction}>
                    <input type="hidden" name="week" value={week} />
                    <input type="hidden" name="slotId" value={activeCell.slotId} />
                    <input type="hidden" name="originalDate" value={activeCell.originalDate ?? activeCell.date} />
                    <div className="field">
                      <label className="label" htmlFor="newDate">
                        {t('newDate')}
                      </label>
                      <input id="newDate" name="newDate" type="date" />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="newStartTime">
                        {t('newStartTime')}
                      </label>
                      <input id="newStartTime" name="newStartTime" type="time" />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="moveNote">
                        {t('note')}
                      </label>
                      <input id="moveNote" name="note" type="text" />
                    </div>
                    <button type="submit" className="button">
                      {t('save')}
                    </button>
                  </form>
                </details>

                <details>
                  <summary>{tGrid('editSlot')}</summary>
                  <form action={updateSlotAction}>
                    <input type="hidden" name="week" value={week} />
                    <input type="hidden" name="slotId" value={activeCell.slotId} />
                    <div className="field">
                      <label className="label" htmlFor="editWeekday">
                        {t('weekday')}
                      </label>
                      <select id="editWeekday" name="weekday" defaultValue={activeCell.weekday}>
                        {WEEKDAY_KEYS.map((key, index) => (
                          <option key={key} value={index}>
                            {tWeekday(key)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="editStartTime">
                        {t('startTime')}
                      </label>
                      <input id="editStartTime" name="startTime" type="time" defaultValue={formatTime(activeCell.time)} required />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="editDuration">
                        {t('duration')}
                      </label>
                      <input
                        id="editDuration"
                        name="durationMinutes"
                        type="number"
                        min={1}
                        defaultValue={activeCell.durationMinutes}
                        required
                      />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="editTimezone">
                        {t('timezone')}
                      </label>
                      <input id="editTimezone" name="timezone" type="text" defaultValue={activeCell.timezone} required />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="editActiveFrom">
                        {t('activeFrom')}
                      </label>
                      <input id="editActiveFrom" name="activeFrom" type="date" defaultValue={activeCell.activeFrom} required />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="editActiveUntil">
                        {t('activeUntil')}
                      </label>
                      <input id="editActiveUntil" name="activeUntil" type="date" defaultValue={activeCell.activeUntil ?? undefined} />
                    </div>
                    <button type="submit" className="button">
                      {t('save')}
                    </button>
                  </form>
                  <button type="button" className="button-danger" onClick={() => setConfirming('deleteSlot')}>
                    {t('delete')}
                  </button>
                </details>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirming === 'cancel'}
        message={tGrid('confirmCancel')}
        confirmLabel={t('cancelAction')}
        onCancel={() => setConfirming(null)}
        onConfirm={confirmCancel}
      />
      <ConfirmDialog
        open={confirming === 'deleteSlot'}
        message={tGrid('confirmDeleteSlot')}
        confirmLabel={t('delete')}
        onCancel={() => setConfirming(null)}
        onConfirm={confirmDeleteSlot}
      />
    </>
  )
}
