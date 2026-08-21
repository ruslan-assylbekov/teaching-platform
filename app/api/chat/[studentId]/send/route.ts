import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { sendMessage } from '../../../../../domain/chat/manage.ts'
import { resolveChatAccess } from '../../../../../lib/chat-auth.ts'
import { chatEvents, eventNameForStudent } from '../../../../../lib/chat-events.ts'

export const runtime = 'nodejs'

const bodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const access = await resolveChatAccess(studentId)
  if (!access.ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: access.status })
  }

  const json = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  const message = await sendMessage(studentId, access.context, parsed.data.body)
  if (!message) {
    // Only reachable if resolveChatAccess's own check somehow diverges from
    // messages.create's -- defense in depth per design spec §3.4, not a
    // path either check alone is expected to hit.
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  chatEvents.emit(eventNameForStudent(studentId), message)

  return NextResponse.json(message, { status: 201 })
}
