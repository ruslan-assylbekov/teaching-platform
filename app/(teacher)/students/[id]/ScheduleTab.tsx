import type { getTranslations } from 'next-intl/server'
import { env } from '../../../../lib/env.ts'
import type { SlotRow } from '../../../../db/queries/schedule.ts'
import { listSlots, listUpcomingOccurrences } from '../../../../domain/schedule/manage.ts'
import {
  cancelOccurrenceAction,
  createSlotAction,
  deleteSlotAction,
  moveOccurrenceAction,
  updateSlotAction,
} from './schedule-actions.ts'

const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

type Translator = Awaited<ReturnType<typeof getTranslations>>

function SlotFields({
  t,
  tWeekday,
  defaults,
}: {
  t: Translator
  tWeekday: Translator
  defaults?: SlotRow
}) {
  return (
    <>
      <div className="field">
        <label className="label" htmlFor="weekday">
          {t('weekday')}
        </label>
        <select id="weekday" name="weekday" defaultValue={defaults?.weekday ?? 0}>
          {WEEKDAY_KEYS.map((key, index) => (
            <option key={key} value={index}>
              {tWeekday(key)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="startTime">
          {t('startTime')}
        </label>
        <input id="startTime" name="startTime" type="time" defaultValue={defaults?.start_time.slice(0, 5)} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="durationMinutes">
          {t('duration')}
        </label>
        <input
          id="durationMinutes"
          name="durationMinutes"
          type="number"
          min={1}
          defaultValue={defaults?.duration_minutes ?? 60}
          required
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="timezone">
          {t('timezone')}
        </label>
        <input id="timezone" name="timezone" type="text" defaultValue={defaults?.timezone ?? env.DEFAULT_TIMEZONE} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="activeFrom">
          {t('activeFrom')}
        </label>
        <input id="activeFrom" name="activeFrom" type="date" defaultValue={defaults?.active_from} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="activeUntil">
          {t('activeUntil')}
        </label>
        <input id="activeUntil" name="activeUntil" type="date" defaultValue={defaults?.active_until ?? undefined} />
      </div>
    </>
  )
}

export async function ScheduleTab({
  studentId,
  conflict,
  t,
  tWeekday,
}: {
  studentId: string
  conflict: { weekday: number; time: string } | null
  t: Translator
  tWeekday: Translator
}) {
  const slots = await listSlots(studentId)
  const occurrenceLists = await Promise.all(slots.map((slot) => listUpcomingOccurrences(slot, 8)))
  const occurrences = occurrenceLists
    .flatMap((list, i) => list.map((occurrence) => ({ occurrence, slot: slots[i]! })))
    .sort((a, b) => a.occurrence.start.toMillis() - b.occurrence.start.toMillis())

  // Server Components legitimately read request-time state (cookies(),
  // headers(), the clock); the react-hooks purity rule is aimed at the
  // React Compiler's client-side memoization guarantees, not this.
  // eslint-disable-next-line react-hooks/purity -- request-time read, not render memoization
  const now = Date.now()

  return (
    <div>
      {conflict && (
        <p className="error-text">
          {t('conflictError', { weekday: tWeekday(WEEKDAY_KEYS[conflict.weekday] ?? 'monday'), time: conflict.time })}
        </p>
      )}

      <h2>{t('addSlot')}</h2>
      <form action={createSlotAction.bind(null, studentId)}>
        <SlotFields t={t} tWeekday={tWeekday} />
        <button type="submit" className="button">
          {t('save')}
        </button>
      </form>

      {slots.length > 0 && (
        <ul className="occurrence-list">
          {slots.map((slot) => (
            <li key={slot.id} className="occurrence-row">
              <details style={{ flex: 1 }}>
                <summary>
                  {tWeekday(WEEKDAY_KEYS[slot.weekday] ?? 'monday')} {slot.start_time.slice(0, 5)} ({slot.duration_minutes} min,{' '}
                  {slot.timezone})
                </summary>
                <form action={updateSlotAction.bind(null, slot.id, studentId)}>
                  <SlotFields t={t} tWeekday={tWeekday} defaults={slot} />
                  <button type="submit" className="button">
                    {t('save')}
                  </button>
                </form>
                <form action={deleteSlotAction.bind(null, slot.id, studentId)}>
                  <button type="submit" className="button-danger">
                    {t('delete')}
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}

      <h2>{t('upcoming')}</h2>
      {occurrences.length === 0 ? (
        <p className="hint-text">{t('noUpcoming')}</p>
      ) : (
        <ul className="occurrence-list">
          {occurrences.map(({ occurrence, slot }) => {
            const key = `${slot.id}-${occurrence.originalDate ?? occurrence.date}`
            const isPast = occurrence.start.toMillis() < now
            return (
              <li key={key} className="occurrence-row">
                <div>
                  {occurrence.date} {occurrence.start.toFormat('HH:mm')}
                  {occurrence.status === 'moved' && (
                    <>
                      {' '}
                      <span className="badge badge-moved">{t('statusMoved')}</span>{' '}
                      {t('movedFrom', { date: occurrence.originalDate ?? '' })}
                    </>
                  )}
                  {isPast && <div className="hint-text">{t('pastNotice')}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <form action={cancelOccurrenceAction.bind(null, studentId)}>
                    <input type="hidden" name="slotId" value={slot.id} />
                    <input type="hidden" name="originalDate" value={occurrence.originalDate ?? occurrence.date} />
                    <button type="submit" className="button-secondary">
                      {t('cancelAction')}
                    </button>
                  </form>
                  <details>
                    <summary>{t('moveAction')}</summary>
                    <form action={moveOccurrenceAction.bind(null, studentId)}>
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="originalDate" value={occurrence.originalDate ?? occurrence.date} />
                      <div className="field">
                        <label className="label" htmlFor={`newDate-${key}`}>
                          {t('newDate')}
                        </label>
                        <input id={`newDate-${key}`} name="newDate" type="date" />
                      </div>
                      <div className="field">
                        <label className="label" htmlFor={`newStartTime-${key}`}>
                          {t('newStartTime')}
                        </label>
                        <input id={`newStartTime-${key}`} name="newStartTime" type="time" />
                      </div>
                      <div className="field">
                        <label className="label" htmlFor={`note-${key}`}>
                          {t('note')}
                        </label>
                        <input id={`note-${key}`} name="note" type="text" />
                      </div>
                      <button type="submit" className="button">
                        {t('save')}
                      </button>
                    </form>
                  </details>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
