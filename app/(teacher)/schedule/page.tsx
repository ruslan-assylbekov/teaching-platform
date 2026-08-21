import Link from 'next/link'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import { WeekCalendarGrid } from '../../../components/schedule/WeekCalendarGrid.tsx'
import type { WeekGridView } from '../../../components/schedule/WeekCalendarGrid.tsx'
import { getTeacherWeekGrid, startOfWeek } from '../../../domain/schedule/grid.ts'
import { listActiveStudents } from '../../../domain/students/directory.ts'
import { env } from '../../../lib/env.ts'

const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

type SearchParams = {
  week?: string
  conflictName?: string
  conflictWeekday?: string
  conflictTime?: string
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const t = await getTranslations('Schedule')
  const tGrid = await getTranslations('TeacherSchedule')
  const tWeekday = await getTranslations('Weekday')

  const requestedWeek = sp.week ? DateTime.fromISO(sp.week, { zone: env.DEFAULT_TIMEZONE }) : DateTime.now().setZone(env.DEFAULT_TIMEZONE)
  const weekStart = startOfWeek(requestedWeek.isValid ? requestedWeek : DateTime.now().setZone(env.DEFAULT_TIMEZONE))

  const [grid, students] = await Promise.all([getTeacherWeekGrid(weekStart), listActiveStudents()])

  const weekGrid: WeekGridView = {
    weekStart: grid.weekStart,
    rows: grid.rows,
    cells: grid.cells.map((cell) => ({
      slotId: cell.slotId,
      studentId: cell.studentId,
      studentName: cell.studentName,
      weekday: cell.weekday,
      time: cell.time,
      durationMinutes: cell.durationMinutes,
      timezone: cell.timezone,
      activeFrom: cell.activeFrom,
      activeUntil: cell.activeUntil,
      status: cell.status,
      date: cell.date,
      originalDate: cell.originalDate,
      note: cell.note,
    })),
  }

  const prevWeek = weekStart.minus({ weeks: 1 }).toISODate()
  const nextWeek = weekStart.plus({ weeks: 1 }).toISODate()
  const thisWeek = startOfWeek(DateTime.now().setZone(env.DEFAULT_TIMEZONE)).toISODate()

  const conflict =
    sp.conflictName !== undefined && sp.conflictWeekday !== undefined && sp.conflictTime !== undefined
      ? { name: sp.conflictName, weekday: Number(sp.conflictWeekday), time: sp.conflictTime }
      : null

  return (
    <div>
      <h1>{tGrid('title')}</h1>

      {conflict && (
        <p className="error-text">
          {t('conflictError', { name: conflict.name, weekday: tWeekday(WEEKDAY_KEYS[conflict.weekday] ?? 'monday'), time: conflict.time })}
        </p>
      )}

      <nav className="week-nav">
        <Link className="button-secondary week-nav-arrow" href={`/schedule?week=${prevWeek}`} aria-label={tGrid('previousWeek')}>
          ◀
        </Link>
        <Link className="button-secondary" href={`/schedule?week=${thisWeek}`}>
          {tGrid('thisWeek')}
        </Link>
        <Link className="button-secondary week-nav-arrow" href={`/schedule?week=${nextWeek}`} aria-label={tGrid('nextWeek')}>
          ▶
        </Link>
      </nav>

      <WeekCalendarGrid
        weekGrid={weekGrid}
        week={weekGrid.weekStart}
        mode="teacher"
        students={students.map((s) => ({ id: s.user_id, name: s.full_name }))}
        defaultTimezone={env.DEFAULT_TIMEZONE}
      />
    </div>
  )
}
