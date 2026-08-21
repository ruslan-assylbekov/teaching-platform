// Run with `node scripts/backup.ts` (Node 24 direct TS execution, same
// pattern as scripts/seed-teacher.ts, design spec §7.7) -- invoked by a
// host-level cron entry or a scheduled Cloud task hitting the VM, since
// Compose alone has no built-in scheduler (design spec §3.1).
//
// Authenticates to GCS via Application Default Credentials -- on the
// actual GCE VM this is the instance's attached service account, no key
// file to manage. Locally it needs `gcloud auth application-default
// login` or GOOGLE_APPLICATION_CREDENTIALS set, neither of which this
// script tries to arrange itself.

import { spawn } from 'node:child_process'
import { createGzip } from 'node:zlib'
import { Storage } from '@google-cloud/storage'
import { env } from '../lib/env.ts'

async function main() {
  if (!env.GCS_BUCKET) {
    throw new Error('GCS_BUCKET is not set -- nowhere to upload the backup to.')
  }
  const bucketName = env.GCS_BUCKET

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const objectName = `backups/jonathan-math-${timestamp}.sql.gz`

  const pgDump = spawn('pg_dump', ['--format=plain', env.DATABASE_URL], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  pgDump.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  const storage = new Storage()
  const uploadStream = storage.bucket(bucketName).file(objectName).createWriteStream({
    resumable: false,
    contentType: 'application/gzip',
  })

  await new Promise<void>((resolve, reject) => {
    let uploadFinished = false
    let dumpExitCode: number | null = null
    let settled = false

    function maybeSettle() {
      if (settled || !uploadFinished || dumpExitCode === null) return
      settled = true
      if (dumpExitCode === 0) {
        resolve()
      } else {
        reject(new Error(`pg_dump exited with code ${dumpExitCode}: ${stderr}`))
      }
    }

    function fail(error: Error) {
      if (settled) return
      settled = true
      reject(error)
    }

    pgDump.stdout.pipe(createGzip()).pipe(uploadStream)

    uploadStream.on('finish', () => {
      uploadFinished = true
      maybeSettle()
    })
    uploadStream.on('error', fail)
    pgDump.on('error', fail)
    pgDump.on('close', (code) => {
      dumpExitCode = code
      maybeSettle()
    })
  })

  console.log(`Backup uploaded to gs://${bucketName}/${objectName}`)
}

main().catch((error: unknown) => {
  console.error('Backup failed:', error)
  process.exitCode = 1
})
