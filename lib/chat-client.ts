'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type ChatMessage = {
  id: string
  student_id: string
  sender: 'teacher' | 'student'
  body: string
  created_at: string
}

export type ChatEntry = ChatMessage & { status: 'sent' | 'sending' | 'failed' }

const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000

function sortByCreatedAt(entries: ChatEntry[]): ChatEntry[] {
  return [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

// Design spec §5.4's chat failure-handling row, shared verbatim by the
// teacher's Chat tab and the student's /me/chat (design spec §7.3's
// SSE-plus-POST transport). lib/, not domain/, because it's framework-
// adjacent client code (EventSource, fetch), matching Plan 01's precedent.
export function useChat(studentId: string, selfSender: 'teacher' | 'student') {
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [connected, setConnected] = useState(false)
  const lastEventIdRef = useRef<string | null>(null)
  const backoffRef = useRef(INITIAL_BACKOFF_MS)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const closedRef = useRef(false)

  const receiveMessage = useCallback((message: ChatMessage) => {
    setEntries((prev) => {
      const index = prev.findIndex((e) => e.id === message.id)
      const entry: ChatEntry = { ...message, status: 'sent' }
      if (index === -1) return sortByCreatedAt([...prev, entry])
      const next = [...prev]
      next[index] = entry
      return next
    })
    lastEventIdRef.current = message.id
  }, [])

  // A plain function declaration, not useCallback -- it calls itself
  // (via setTimeout) to reconnect with backoff, and a function declaration
  // hoists within its own scope, unlike a self-referencing `const`
  // useCallback, which React's purity/immutability lint flags.
  useEffect(() => {
    closedRef.current = false

    function connect() {
      if (closedRef.current) return
      const query = lastEventIdRef.current ? `?lastEventId=${encodeURIComponent(lastEventIdRef.current)}` : ''
      const source = new EventSource(`/api/chat/${studentId}/stream${query}`)
      eventSourceRef.current = source

      source.onopen = () => {
        backoffRef.current = INITIAL_BACKOFF_MS
        setConnected(true)
      }

      source.onmessage = (event) => {
        try {
          receiveMessage(JSON.parse(event.data) as ChatMessage)
        } catch {
          // Malformed event: skip it rather than tearing down the stream.
        }
      }

      source.onerror = () => {
        source.close()
        setConnected(false)
        if (closedRef.current) return
        const delay = backoffRef.current
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
        reconnectTimerRef.current = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      closedRef.current = true
      eventSourceRef.current?.close()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    }
  }, [studentId, receiveMessage])

  const performSend = useCallback(
    async (tempId: string, body: string) => {
      setEntries((prev) => prev.map((e) => (e.id === tempId ? { ...e, status: 'sending' as const } : e)))
      try {
        const response = await fetch(`/api/chat/${studentId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        })
        if (!response.ok) throw new Error(`send failed: ${response.status}`)
        const message = (await response.json()) as ChatMessage

        // Idempotent with a live SSE echo of the same message id -- both
        // paths funnel through the same id-keyed upsert, so whichever
        // arrives second just overwrites the entry with itself.
        setEntries((prev) => sortByCreatedAt([...prev.filter((e) => e.id !== tempId), { ...message, status: 'sent' as const }]))
        lastEventIdRef.current = message.id
      } catch {
        setEntries((prev) => prev.map((e) => (e.id === tempId ? { ...e, status: 'failed' as const } : e)))
      }
    },
    [studentId],
  )

  const send = useCallback(
    (body: string) => {
      const tempId = `pending-${crypto.randomUUID()}`
      const optimistic: ChatEntry = {
        id: tempId,
        student_id: studentId,
        sender: selfSender,
        body,
        created_at: new Date().toISOString(),
        status: 'sending',
      }
      setEntries((prev) => sortByCreatedAt([...prev, optimistic]))
      void performSend(tempId, body)
    },
    [studentId, selfSender, performSend],
  )

  const retry = useCallback(
    (tempId: string, body: string) => {
      void performSend(tempId, body)
    },
    [performSend],
  )

  return { entries, connected, send, retry }
}
