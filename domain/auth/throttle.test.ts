import { beforeEach, describe, expect, it } from 'vitest'
import { isLocked, recordFailure, recordSuccess } from './throttle.ts'

// Each test uses a fresh username/IP pair since the module holds module-level
// state (by design — it's a process-wide in-memory throttle).
let counter = 0
function freshKeys() {
  counter += 1
  return { username: `user${counter}`, ip: `10.0.0.${counter}` }
}

describe('login throttle', () => {
  it('locks a username after 5 failures within 15 minutes', () => {
    const { username, ip } = freshKeys()
    const now = 1_000_000
    for (let i = 0; i < 4; i += 1) recordFailure(username, ip, now)
    expect(isLocked(username, ip, now)).toBe(false)
    recordFailure(username, ip, now)
    expect(isLocked(username, ip, now)).toBe(true)
  })

  it('locks an IP after 20 failures within 15 minutes, across usernames', () => {
    const { ip } = freshKeys()
    const now = 2_000_000
    for (let i = 0; i < 20; i += 1) recordFailure(`victim${i}`, ip, now)
    expect(isLocked('someone-else', ip, now)).toBe(true)
  })

  it('is case-insensitive on username, matching citext login lookup', () => {
    const { ip } = freshKeys()
    const now = 3_000_000
    for (let i = 0; i < 5; i += 1) recordFailure('Aisha.K', ip, now)
    expect(isLocked('aisha.k', ip, now)).toBe(true)
  })

  it('lets the window expire after 15 minutes', () => {
    const { username, ip } = freshKeys()
    const start = 4_000_000
    for (let i = 0; i < 5; i += 1) recordFailure(username, ip, start)
    expect(isLocked(username, ip, start)).toBe(true)
    const after = start + 15 * 60 * 1000 + 1
    expect(isLocked(username, ip, after)).toBe(false)
  })

  it('clears both counters on success', () => {
    const { username, ip } = freshKeys()
    const now = 5_000_000
    for (let i = 0; i < 5; i += 1) recordFailure(username, ip, now)
    expect(isLocked(username, ip, now)).toBe(true)
    recordSuccess(username, ip)
    expect(isLocked(username, ip, now)).toBe(false)
  })
})
