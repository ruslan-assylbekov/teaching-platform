import { redirect } from 'next/navigation'
import { ChatPanel } from '../../../../components/chat/ChatPanel.tsx'
import { getCurrentUser } from '../../../../lib/session.ts'

export default async function StudentChatPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return <ChatPanel studentId={user.id} selfSender="student" />
}
