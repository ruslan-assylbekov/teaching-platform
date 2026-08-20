import { Pool } from 'pg'
import { env } from '../lib/env.ts'

// Single shared pool for the whole app process. db/ is the only layer
// allowed to import pg directly (design spec §3.2, §7.4).
export const pool = new Pool({ connectionString: env.DATABASE_URL })
