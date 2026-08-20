import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.ts'

describe('password hashing', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword(hash, 'wrong password')).toBe(false)
  })

  it('produces a genuine argon2id hash at the spec-mandated parameters', async () => {
    const hash = await hashPassword('anything')
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })

  it('salts each hash uniquely', async () => {
    const a = await hashPassword('same password')
    const b = await hashPassword('same password')
    expect(a).not.toBe(b)
  })
})
