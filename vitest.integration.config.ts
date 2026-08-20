import { defineConfig } from 'vitest/config'

// Separate from vitest.config.ts deliberately: these tests need a real
// reachable Postgres (design spec §7.4 — "the integration test is the type
// check" for hand-written SQL), so they must not run as part of the
// default `npm test`, which has to pass without Docker running. Run via
// `docker compose run --rm tools npm run test:integration` (or any shell
// with DATABASE_URL pointed at a real, migrated Postgres).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
})
