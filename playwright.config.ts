import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'

// Runs against the already-running Docker Compose stack (design spec §3.1)
// on localhost -- no webServer block here, since `next dev` isn't how this
// app is meant to be exercised; `docker compose up` is. Start the stack
// yourself before running `npx playwright test`.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
