import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { LocaleSwitcher } from '../../components/LocaleSwitcher.tsx'
import { getCurrentUser } from '../../lib/session.ts'
import { listActiveStudents } from '../../domain/students/directory.ts'
import { getUnreadCountsForTeacher } from '../../domain/chat/manage.ts'
import { logoutAction } from '../logout-action.ts'

// Route-group boundary guard (design spec §3.4, boundary check #1). A
// student hitting a teacher route bounces to their own home, not /login --
// they are authenticated, just the wrong role for this subtree.
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'teacher') redirect('/me')

  const t = await getTranslations('Teacher')
  const tCommon = await getTranslations('Common')
  const students = await listActiveStudents()
  const unreadCounts = await getUnreadCountsForTeacher(
    user.id,
    students.map((s) => s.user_id),
  )

  return (
    <div className="teacher-shell">
      <aside className="teacher-sidebar">
        <Link className="sidebar-pinned" href="/">
          {t('today')}
        </Link>

        <div>
          <h3 className="label sidebar-section-title">{t('students')}</h3>
          <ul className="sidebar-list">
            {students.map((student) => {
              const unread = unreadCounts.get(student.user_id) ?? 0
              return (
                <li key={student.user_id}>
                  <Link href={`/students/${student.user_id}`}>
                    {student.full_name}
                    {unread > 0 && (
                      <>
                        {' '}
                        <span className="badge badge-moved">{unread}</span>
                      </>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="sidebar-footer">
          <Link href="/students/new">+ {t('newStudent')}</Link>
          <Link href="/students/archived">{t('archivedStudents')}</Link>
          <LocaleSwitcher current={user.locale} />
          <form action={logoutAction}>
            <button type="submit" className="button-secondary" style={{ width: '100%' }}>
              {tCommon('logOut')}
            </button>
          </form>
        </div>
      </aside>
      <main className="teacher-main">{children}</main>
    </div>
  )
}
