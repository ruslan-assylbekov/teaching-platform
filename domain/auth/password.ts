import { hash, verify } from '@node-rs/argon2'
import type { Algorithm } from '@node-rs/argon2'

// @node-rs/argon2 declares Algorithm as an ambient const enum, which fails
// type checking under Next.js's mandatory isolatedModules (TS2748: Cannot
// access ambient const enums). A type-only import plus a named numeric
// constant sidesteps it. 2 is argon2id's numeric value in this library.
const ARGON2ID = 2 as Algorithm

// OWASP-recommended Argon2id parameters (design spec §7.5): 19 MiB memory,
// 2 iterations, parallelism 1. Passed explicitly even though they match the
// library defaults — a security parameter should not rest on a default a
// minor release could silently revisit.
const HASH_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, HASH_OPTIONS)
}

export async function verifyPassword(encodedHash: string, plain: string): Promise<boolean> {
  return verify(encodedHash, plain, HASH_OPTIONS)
}
