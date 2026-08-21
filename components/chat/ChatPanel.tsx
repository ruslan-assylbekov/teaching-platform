'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { markThreadReadAction } from '../../app/mark-read-action.ts'
import { useChat } from '../../lib/chat-client.ts'

// Shared verbatim by the teacher's Chat tab and the student's /me/chat
// (design spec §5.1) -- same failure modes apply to both sides equally.
export function ChatPanel({ studentId, selfSender }: { studentId: string; selfSender: 'teacher' | 'student' }) {
  const { entries, connected, send, retry } = useChat(studentId, selfSender)
  const t = useTranslations('Chat')
  const [draft, setDraft] = useState('')

  useEffect(() => {
    void markThreadReadAction(studentId)
  }, [studentId, entries.length])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    send(trimmed)
    setDraft('')
  }

  return (
    <div className="chat-panel">
      {!connected && <p className="hint-text">{t('reconnecting')}</p>}
      <ul className="chat-messages">
        {entries.map((entry) => (
          <li key={entry.id} className={`chat-message ${entry.sender === selfSender ? 'chat-message-self' : 'chat-message-other'}`}>
            <p>{entry.body}</p>
            {entry.status === 'sending' && <span className="hint-text">{t('sending')}</span>}
            {entry.status === 'failed' && (
              <span className="error-text">
                {t('failed')}{' '}
                <button type="button" className="button-secondary" onClick={() => retry(entry.id, entry.body)}>
                  {t('retry')}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="chat-composer">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('placeholder')}
        />
        <button type="submit" className="button">
          {t('send')}
        </button>
      </form>
    </div>
  )
}
