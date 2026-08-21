import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { listArchivedStudents } from '../../../../domain/students/directory.ts'
import { unarchiveAction } from './actions.ts'

export default async function ArchivedStudentsPage() {
  const t = await getTranslations('Archived')
  const students = await listArchivedStudents()

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>
        <Link href="/students">{t('backLink')}</Link>
      </p>
      {students.length === 0 ? (
        <p className="hint-text">{t('empty')}</p>
      ) : (
        <ul className="occurrence-list">
          {students.map((student) => (
            <li key={student.user_id} className="occurrence-row">
              <span>{student.full_name}</span>
              <form action={unarchiveAction}>
                <input type="hidden" name="userId" value={student.user_id} />
                <button type="submit" className="button-secondary">
                  {t('unarchive')}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
