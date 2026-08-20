import { describe, expect, it } from 'vitest'
import { generateOneTimePassword, generateUsername } from './credentials.ts'

describe('generateUsername', () => {
  it('derives a first.lastinitial username', async () => {
    const username = await generateUsername('Aisha Kadyrova', async () => false)
    expect(username).toBe('aisha.k')
  })

  it('appends a numeric suffix on collision', async () => {
    const taken = new Set(['aisha.k', 'aisha.k2'])
    const username = await generateUsername('Aisha Kadyrova', async (candidate) => taken.has(candidate))
    expect(username).toBe('aisha.k3')
  })

  it('falls back to a bare first name when there is only one name', async () => {
    const username = await generateUsername('Madi', async () => false)
    expect(username).toBe('madi')
  })

  it('strips punctuation and lowercases', async () => {
    const username = await generateUsername("Anna-Maria O'Brien", async () => false)
    expect(username).toBe('annamaria.o')
  })
})

describe('generateOneTimePassword', () => {
  it('generates a 12-character password from the unambiguous alphabet', () => {
    const password = generateOneTimePassword()
    expect(password).toHaveLength(12)
    expect(password).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9]+$/)
  })

  it('generates different passwords on successive calls', () => {
    const a = generateOneTimePassword()
    const b = generateOneTimePassword()
    expect(a).not.toBe(b)
  })
})
