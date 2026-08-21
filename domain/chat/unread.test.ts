import { describe, expect, it } from 'vitest'
import { countUnread } from './unread.ts'

function at(iso: string): { created_at: Date } {
  return { created_at: new Date(iso) }
}

describe('countUnread', () => {
  it('counts every message when there is no read marker yet', () => {
    const messages = [at('2026-01-01T10:00:00Z'), at('2026-01-01T11:00:00Z')]
    expect(countUnread(messages, null)).toBe(2)
  })

  it('counts only messages strictly after the read marker', () => {
    const messages = [at('2026-01-01T10:00:00Z'), at('2026-01-01T11:00:00Z'), at('2026-01-01T12:00:00Z')]
    expect(countUnread(messages, new Date('2026-01-01T11:00:00Z'))).toBe(1)
  })

  it('returns 0 when everything is read', () => {
    const messages = [at('2026-01-01T10:00:00Z')]
    expect(countUnread(messages, new Date('2026-01-01T12:00:00Z'))).toBe(0)
  })

  it('returns 0 for an empty thread', () => {
    expect(countUnread([], null)).toBe(0)
  })
})
