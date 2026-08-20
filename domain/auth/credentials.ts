import { randomInt } from 'node:crypto'

// Design spec §5.2: username derived from the student's name, "first.last"
// style, numeric suffix on collision (e.g. "aisha.k", "aisha.k2"). The
// collision check is injected rather than importing db/ directly, so this
// stays a pure, unit-testable function per the domain/ layering rule.
export type UsernameExists = (username: string) => Promise<boolean>

function normalize(part: string): string {
  return part.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function deriveBaseUsername(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const first = normalize(parts[0] ?? '')
  const last = parts.length > 1 ? normalize(parts[parts.length - 1]) : ''
  const base = last ? `${first}.${last[0]}` : first
  return base || 'student'
}

export async function generateUsername(fullName: string, exists: UsernameExists): Promise<string> {
  const base = deriveBaseUsername(fullName)
  let candidate = base
  let suffix = 2
  while (await exists(candidate)) {
    candidate = `${base}${suffix}`
    suffix += 1
  }
  return candidate
}

// Excludes visually ambiguous characters (0/O, 1/l/I) since a one-time
// password is read aloud or copied by hand, often by a young student.
// Plain random characters were chosen over a passphrase/wordlist generator
// to avoid bundling a wordlist for a credential that's typed once and
// replaced by the student's own password immediately after.
const ONE_TIME_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const ONE_TIME_PASSWORD_LENGTH = 12

export function generateOneTimePassword(): string {
  let password = ''
  for (let i = 0; i < ONE_TIME_PASSWORD_LENGTH; i += 1) {
    password += ONE_TIME_PASSWORD_ALPHABET[randomInt(ONE_TIME_PASSWORD_ALPHABET.length)]
  }
  return password
}
