import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCurrentUser } from '../../../lib/session.ts'
import { getStudentDashboard } from '../../../domain/students/dashboard.ts'

export default async function MePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const dashboard = await getStudentDashboard(user.id, { role: 'student', userId: user.id })
  if (!dashboard) redirect('/login')

  const t = await getTranslations('StudentMe')
  const tSchedule = await getTranslations('Schedule')

  const [nextClass, ...rest] = dashboard.occurrences

  return (
    <div>
      <h1>{dashboard.fullName}</h1>

      <section className="card">
        <h2>{t('nextClass')}</h2>
        {nextClass ? (
          <p>
            {nextClass.date} {nextClass.start.toFormat('HH:mm')}
            {nextClass.status === 'moved' && (
              <>
                {' '}
                <span className="badge badge-moved">{tSchedule('statusMoved')}</span>
              </>
            )}
          </p>
        ) : (
          <p className="hint-text">{t('noNextClass')}</p>
        )}
      </section>

      <section>
        <h2>{t('upcoming')}</h2>
        {rest.length === 0 ? (
          <p className="hint-text">{t('noUpcoming')}</p>
        ) : (
          <ul className="occurrence-list">
            {rest.map((occurrence) => (
              <li key={occurrence.date} className="occurrence-row">
                <span>
                  {occurrence.date} {occurrence.start.toFormat('HH:mm')}
                </span>
                {occurrence.status === 'moved' && <span className="badge badge-moved">{tSchedule('statusMoved')}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>{t('objectives')}</h2>
        <p>{dashboard.objectives || t('noObjectives')}</p>
      </section>
    </div>
  )
}
