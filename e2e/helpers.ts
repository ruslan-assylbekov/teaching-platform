import { config as loadDotenv } from 'dotenv'
import type { Page } from '@playwright/test'

// Playwright runs test files in worker processes; relying on
// playwright.config.ts's own `import 'dotenv/config'` to have already
// populated process.env by the time a worker imports this file isn't
// reliable, so load .env directly here too.
loadDotenv()

// ID selectors, not label/text matchers: this app's UI text is
// locale-dependent (design spec §2's RU/EN switch), and the teacher/
// seeded-account default locale is 'ru' -- matching by rendered English
// text would be fragile. Every form field in this codebase has a stable
// `id` for exactly this reason.
export async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('button[type=submit]').click()
  // The form posts a real Server Action; with JS enabled (unlike the
  // no-JS curl testing this endpoint was originally verified against),
  // Next.js resolves it via a client-side router transition rather than a
  // classic full-page navigation, so click() resolving doesn't guarantee
  // the redirect away from /login has landed yet.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 })
}

export const TEACHER_USERNAME = process.env.TEACHER_SEED_USERNAME ?? 'teacher'
export const TEACHER_PASSWORD = process.env.TEACHER_SEED_PASSWORD ?? ''
