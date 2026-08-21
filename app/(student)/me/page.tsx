import Link from 'next/link'
import { DateTime } from 'luxon'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { WeekCalendarGrid } from '../../../components/schedule/WeekCalendarGrid.tsx'
import type { WeekGridView } from '../../../components/schedule/WeekCalendarGrid.tsx'
import { getStudentWeekGrid, startOfWeek } from '../../../domain/schedule/grid.ts'
import { getStudentDashboard } from '../../../domain/students/dashboard.ts'
import { env } from '../../../lib/env.ts'
import { getCurrentUser } from '../../../lib/session.ts'

type SearchParams = { week?: string }

export default async function MePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const dashboard = await getStudentDashboard(user.id, { role: 'student', userId: user.id })
  if (!dashboard) redirect('/login')

  const tGrid = await getTranslations('TeacherSchedule')

  const requestedWeek = sp.week ? DateTime.fromISO(sp.week, { zone: env.DEFAULT_TIMEZONE }) : DateTime.now().setZone(env.DEFAULT_TIMEZONE)
  const weekStart = startOfWeek(requestedWeek.isValid ? requestedWeek : DateTime.now().setZone(env.DEFAULT_TIMEZONE))

  const grid = await getStudentWeekGrid(user.id, dashboard.fullName, weekStart)

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

  return (
    <div>
      <h1>{dashboard.fullName}</h1>

      <nav className="week-nav">
        <Link className="button-secondary week-nav-arrow" href={`/me?week=${prevWeek}`} aria-label={tGrid('previousWeek')}>
          ◀
        </Link>
        <Link className="button-secondary" href={`/me?week=${thisWeek}`}>
          {tGrid('thisWeek')}
        </Link>
        <Link className="button-secondary week-nav-arrow" href={`/me?week=${nextWeek}`} aria-label={tGrid('nextWeek')}>
          ▶
        </Link>
      </nav>

      <WeekCalendarGrid weekGrid={weekGrid} week={weekGrid.weekStart} mode="student" defaultTimezone={env.DEFAULT_TIMEZONE} />
    </div>
  )
}
