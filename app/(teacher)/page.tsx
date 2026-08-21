import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getUnreadCountsForTeacher } from '../../domain/chat/manage.ts'
import { listActiveStudents } from '../../domain/students/directory.ts'
import { getTodayClasses } from '../../domain/students/today.ts'
import { getCurrentUser } from '../../lib/session.ts'

export default async function TodayPage() {
  const t = await getTranslations('Today')
  const tSchedule = await getTranslations('Schedule')
  const user = await getCurrentUser()
  const classes = await getTodayClasses()

  const students = await listActiveStudents()
  const unreadCounts = user
    ? await getUnreadCountsForTeacher(
        user.id,
        students.map((s) => s.user_id),
      )
    : new Map<string, number>()
  const unreadStudents = students.filter((s) => (unreadCounts.get(s.user_id) ?? 0) > 0)

  return (
    <div>
      <h1>{t('title')}</h1>
      {classes.length === 0 ? (
        <p className="hint-text">{t('empty')}</p>
      ) : (
        <ul className="occurrence-list">
          {classes.map(({ student, occurrence }) => (
            <li key={`${student.user_id}-${occurrence.date}`} className="occurrence-row">
              <Link href={`/students/${student.user_id}`}>
                {t('classAt', { time: occurrence.start.toFormat('HH:mm'), name: student.full_name })}
              </Link>
              {occurrence.status === 'moved' && <span className="badge badge-moved">{tSchedule('statusMoved')}</span>}
            </li>
          ))}
        </ul>
      )}

      {unreadStudents.length > 0 && (
        <ul className="occurrence-list" style={{ marginTop: '1.5rem' }}>
          {unreadStudents.map((student) => (
            <li key={student.user_id} className="occurrence-row">
              <Link href={`/students/${student.user_id}?tab=chat`}>{student.full_name}</Link>
              <span className="badge badge-moved">{unreadCounts.get(student.user_id)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
