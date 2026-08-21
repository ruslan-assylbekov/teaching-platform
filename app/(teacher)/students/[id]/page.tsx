import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ChatPanel } from '../../../../components/chat/ChatPanel.tsx'
import { getStudentDetail } from '../../../../domain/students/manage.ts'
import { ProfileTab } from './ProfileTab.tsx'

type SearchParams = {
  tab?: string
  deleteError?: string
}

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const { id } = await params
  const sp = await searchParams
  const activeTab = sp.tab === 'chat' ? 'chat' : 'profile'

  const student = await getStudentDetail(id)
  if (!student) notFound()

  const t = await getTranslations('StudentDetail')

  return (
    <div>
      <h1>{student.full_name}</h1>
      <nav className="tabs">
        <a className="tab-link" aria-current={activeTab === 'profile' ? 'page' : undefined} href={`/students/${id}?tab=profile`}>
          {t('profileTab')}
        </a>
        <a className="tab-link" aria-current={activeTab === 'chat' ? 'page' : undefined} href={`/students/${id}?tab=chat`}>
          {t('chatTab')}
        </a>
      </nav>

      {activeTab === 'profile' && <ProfileTab student={student} deleteError={sp.deleteError === '1'} />}
      {activeTab === 'chat' && <ChatPanel studentId={id} selfSender="teacher" />}
    </div>
  )
}
