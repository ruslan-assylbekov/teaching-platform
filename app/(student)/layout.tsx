import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { LocaleSwitcher } from '../../components/LocaleSwitcher.tsx'
import { getUnreadCount } from '../../domain/chat/manage.ts'
import { getCurrentUser } from '../../lib/session.ts'
import { logoutAction } from '../logout-action.ts'

// Mirrors the (teacher) layout's guard (design spec §3.4): a teacher
// hitting a student route bounces to their own home, not /login.
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'student') redirect('/')

  const t = await getTranslations('StudentNav')
  const tCommon = await getTranslations('Common')
  const unread = await getUnreadCount(user.id, { role: 'student', userId: user.id }, user.id)

  return (
    <div className="student-shell">
      <nav className="student-nav">
        <Link href="/me">{t('home')}</Link>
        <Link href="/me/chat">
          {t('chat')}
          {unread > 0 && (
            <>
              {' '}
              <span className="badge badge-moved">{unread}</span>
            </>
          )}
        </Link>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <LocaleSwitcher current={user.locale} />
          <form action={logoutAction}>
            <button type="submit" className="button-secondary">
              {tCommon('logOut')}
            </button>
          </form>
        </div>
      </nav>
      {children}
    </div>
  )
}
