import type { NextRequest } from 'next/server'
import { listThread, listThreadSince } from '../../../../../domain/chat/manage.ts'
import type { MessageRow } from '../../../../../db/queries/messages.ts'
import { chatEvents, eventNameForStudent } from '../../../../../lib/chat-events.ts'
import { resolveChatAccess } from '../../../../../lib/chat-auth.ts'

// Needs the Node.js runtime, not Edge: pg (via messagesDb) needs real TCP
// sockets, and the long-lived EventEmitter subscription needs a real
// persistent process, not a per-request Edge isolate.
export const runtime = 'nodejs'

function formatEvent(message: MessageRow): string {
  // The SSE event id is the message's own id, so the client's automatic
  // Last-Event-ID resumption (design spec §7.3) works with no extra
  // bookkeeping on either side.
  return `id: ${message.id}\ndata: ${JSON.stringify(message)}\n\n`
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const access = await resolveChatAccess(studentId)
  if (!access.ok) {
    return new Response(null, { status: access.status })
  }
  const { context } = access

  // Falls back to a query param because the browser's EventSource API has
  // no way to set request headers -- the header only ever gets sent by the
  // browser's own automatic reconnect, and lib/chat-client.ts deliberately
  // manages reconnection itself (for exponential backoff), constructing a
  // fresh EventSource each time rather than relying on that.
  const lastEventId = request.headers.get('last-event-id') ?? request.nextUrl.searchParams.get('lastEventId')

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      // Catch-up before switching to live: everything since the client's
      // last seen message (a reconnect), or the whole thread (first
      // connect) -- design spec §5.4's "refetch history so no message is
      // missed in the gap."
      const catchUp = lastEventId ? await listThreadSince(studentId, context, lastEventId) : await listThread(studentId, context)

      for (const message of catchUp) {
        controller.enqueue(encoder.encode(formatEvent(message)))
      }

      const eventName = eventNameForStudent(studentId)
      const onMessage = (message: MessageRow) => {
        controller.enqueue(encoder.encode(formatEvent(message)))
      }
      chatEvents.on(eventName, onMessage)

      request.signal.addEventListener('abort', () => {
        chatEvents.off(eventName, onMessage)
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      })
    },
  })

  // Content-Type is load-bearing, not cosmetic (design spec §7.3): Caddy
  // only skips its own buffering and flushes immediately when the response
  // actually carries text/event-stream. No proxy config change is needed
  // as a result -- if messages ever arrive delayed, check this header
  // first before touching Caddy.
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
