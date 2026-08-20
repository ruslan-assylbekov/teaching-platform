import { z } from 'zod'
// Explicit .js extension: Next's own bundler resolves the bare specifier
// fine, but scripts/seed-teacher.ts imports this module transitively under
// plain `node script.ts` (design spec §7.7), whose stricter ESM resolution
// needs the real filename since next/package.json has no "exports" map
// entry for this subpath.
import { PHASE_PRODUCTION_BUILD } from 'next/constants.js'

// Leaf module: imports nothing from this codebase, so it is safe to import
// from any layer (app/, lib/, domain/, db/) without violating the
// app -> lib -> domain -> db call-order rule (design spec §3.2, refined in
// the Phase 1 plan index).

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  DEFAULT_TIMEZONE: z.string().min(1),
  TEACHER_SEED_USERNAME: z.string().min(1),
  TEACHER_SEED_PASSWORD: z.string().min(1),
  APP_HOSTNAME: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

// `next build` imports every route's module graph to classify it as
// static/dynamic ("Collecting page data"), which evaluates this module
// without any runtime secret present — inside Docker there is no .env in
// the build context at all (deliberately: secrets shouldn't be baked into
// an image layer), and even outside Docker a CI build server wouldn't have
// one either. Validating eagerly here previously broke the build itself,
// not just a misconfigured deployment. NEXT_PHASE is set to
// phase-production-build only during that build step, never during
// `next start` / `node server.js` / `next dev` / plain `node script.ts`,
// so skipping validation there still leaves every real runtime path
// failing fast on the first access to `env`, as intended.
const isProductionBuildPhase = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD

const parsed = isProductionBuildPhase
  ? { success: true as const, data: { ...process.env } as unknown as z.infer<typeof schema> }
  : schema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
  throw new Error(`Invalid or missing environment variables:\n${issues}`)
}

export const env = Object.freeze(parsed.data)
