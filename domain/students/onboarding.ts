import { withTransaction } from '../../db/client.ts'
import * as sessionsDb from '../../db/queries/sessions.ts'
import * as studentsDb from '../../db/queries/students.ts'
import type { StudentRow } from '../../db/queries/students.ts'
import * as usersDb from '../../db/queries/users.ts'
import type { UserRow } from '../../db/queries/users.ts'
import { generateOneTimePassword, generateUsername } from '../auth/credentials.ts'
import { hashPassword } from '../auth/password.ts'

export type OnboardStudentInput = {
  fullName: string
  grade: string
  school: string | null
  level: string
  objectives: string | null
  privateNotes: string | null
  parentPhone: string | null
  parentName: string | null
}

export type OnboardStudentResult = {
  user: UserRow
  student: StudentRow
  // Plaintext, returned exactly once (design spec §5.2) -- nothing else in
  // this module or its callers persists it anywhere; only the hash is
  // stored.
  oneTimePassword: string
}

export async function onboardStudent(input: OnboardStudentInput): Promise<OnboardStudentResult> {
  const username = await generateUsername(input.fullName, async (candidate) => {
    return (await usersDb.findByUsername(candidate)) !== null
  })
  const oneTimePassword = generateOneTimePassword()
  const passwordHash = await hashPassword(oneTimePassword)

  const { user, student } = await withTransaction(async (client) => {
    const user = await usersDb.createStudentUser({ username, passwordHash }, client)
    const student = await studentsDb.create(
      {
        userId: user.id,
        fullName: input.fullName,
        grade: input.grade,
        school: input.school,
        level: input.level,
        objectives: input.objectives,
        privateNotes: input.privateNotes,
        parentPhone: input.parentPhone,
        parentName: input.parentName,
      },
      client,
    )
    return { user, student }
  })

  return { user, student, oneTimePassword }
}

// "Teacher reissues instead" (design spec §5.2) -- the old one-time
// password is not recoverable. Kills existing sessions since the student
// is about to be forced through change-password again with a credential
// they don't have yet.
export async function reissueCredentials(userId: string): Promise<{ oneTimePassword: string }> {
  const oneTimePassword = generateOneTimePassword()
  const passwordHash = await hashPassword(oneTimePassword)

  await usersDb.setPasswordHash(userId, passwordHash)
  await usersDb.setMustChangePassword(userId, true)
  await sessionsDb.deleteAllForUser(userId)

  return { oneTimePassword }
}
