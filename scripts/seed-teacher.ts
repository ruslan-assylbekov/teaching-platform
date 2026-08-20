// Run with `node scripts/seed-teacher.ts` — Node 24 executes TypeScript
// directly, no build step, as long as relative imports carry explicit .ts
// extensions (design spec §7.7).
//
// Design spec §5.5: without this there is no way into a fresh deployment.
// Refuses to run if any teacher account already exists, so it can't be
// re-run against a live system to create a second one by accident.

import { env } from '../lib/env.ts'
import { countTeachers, createTeacher } from '../db/queries/users.ts'
import { hashPassword } from '../domain/auth/password.ts'
import { pool } from '../db/client.ts'

async function main() {
  const existing = await countTeachers()
  if (existing > 0) {
    console.error('A teacher account already exists. Refusing to seed another one.')
    process.exitCode = 1
    return
  }

  const passwordHash = await hashPassword(env.TEACHER_SEED_PASSWORD)
  const teacher = await createTeacher({
    username: env.TEACHER_SEED_USERNAME,
    passwordHash,
  })

  console.log(`Created teacher account "${teacher.username}".`)
}

main()
  .catch((error: unknown) => {
    console.error('Failed to seed teacher account:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void pool.end()
  })
