import { expect, test } from '@playwright/test'
import { TEACHER_PASSWORD, TEACHER_USERNAME, login } from './helpers.ts'

// Design spec §6's four e2e paths, run in order as one journey since paths
// 2-4 all depend on the student path 1 creates. serial mode: if an earlier
// step fails, later ones are skipped rather than run against a broken
// precondition.
test.describe.serial('full journey', () => {
  const studentFullName = `E2E Student ${Date.now()}`
  let studentUsername = ''
  let studentOneTimePassword = ''
  let studentNewPassword = ''
  let studentId = ''

  test('path 1: teacher creates a student and receives credentials', async ({ page }) => {
    await login(page, TEACHER_USERNAME, TEACHER_PASSWORD)
    await page.goto('/students/new')

    await page.locator('#fullName').fill(studentFullName)
    await page.locator('#grade').fill('9')
    await page.locator('#level').fill('intermediate')
    // Not just `button[type=submit]` -- the sidebar's logout button
    // matches that on every teacher page too.
    await page.locator('form:has(#fullName) button[type=submit]').click()

    // Credential reveal screen (design spec §5.2: shown once). .card has
    // three <p> tags -- warning, username, password -- so target the
    // username paragraph by position and the password by its <code>
    // wrapper, not by translated label text (the teacher's default
    // locale is 'ru').
    const usernameParagraph = page.locator('.card p').nth(1)
    studentUsername = (await usernameParagraph.innerText()).split('\n').pop()!.trim()
    studentOneTimePassword = (await page.locator('.card code').innerText()).trim()

    expect(studentUsername.length).toBeGreaterThan(0)
    expect(studentOneTimePassword.length).toBeGreaterThanOrEqual(8)

    const doneHref = await page.locator('a.button').getAttribute('href')
    studentId = doneHref!.split('/').pop()!
    expect(studentId.length).toBeGreaterThan(0)
  })

  test('path 2: the student logs in and is forced to change their password', async ({ page }) => {
    await login(page, studentUsername, studentOneTimePassword)
    await expect(page).toHaveURL(/\/change-password/)

    studentNewPassword = 'E2eNewPass123!'
    await page.locator('#currentPassword').fill(studentOneTimePassword)
    await page.locator('#newPassword').fill(studentNewPassword)
    await page.locator('#confirmPassword').fill(studentNewPassword)
    await page.locator('button[type=submit]').click()

    await expect(page).toHaveURL(/\/me$/)
  })

  test('path 4: schedule renders correctly with a cancellation and a move applied', async ({ page }) => {
    await login(page, TEACHER_USERNAME, TEACHER_PASSWORD)
    await page.goto(`/students/${studentId}?tab=schedule`)

    await page.locator('#weekday').selectOption('0')
    await page.locator('#startTime').fill('17:00')
    await page.locator('#durationMinutes').fill('60')
    await page.locator('#timezone').fill('Asia/Almaty')
    await page.locator('#activeFrom').fill('2026-01-01')
    await page.locator('form:has(#weekday) button[type=submit]').click()

    // Two <ul class="occurrence-list"> exist on this page: the slot list
    // (edit/delete) and the upcoming-occurrences list (cancel/move) --
    // structural selectors (which form is inside), not text, since labels
    // are locale-dependent.
    const upcomingList = page.locator('ul.occurrence-list').nth(1)
    await expect(upcomingList.locator('.occurrence-row').first()).toBeVisible()

    // Both the cancel form and the move form (nested in <details>) carry
    // an originalDate hidden field; the cancel form is the one that isn't
    // inside <details> and appears first in DOM order.
    const firstRow = upcomingList.locator('.occurrence-row').nth(0)
    const firstRowDate = await firstRow.locator('> div').first().innerText()
    await firstRow.locator('> div > form').first().locator('button[type=submit]').click()

    // "some row is visible" is trivially true even before the cancellation
    // round-trips (the stale first row is still there) -- wait for that
    // *specific* row to actually disappear, or the click below can land on
    // a row that gets removed out from under it mid-interaction.
    await expect(upcomingList.locator('.occurrence-row', { hasText: firstRowDate })).toHaveCount(0)

    const secondRow = upcomingList.locator('.occurrence-row').nth(0)
    await secondRow.locator('details summary').click()
    await expect(secondRow.locator('input[name="newDate"]')).toBeVisible()
    await secondRow.locator('input[name="newDate"]').fill('2026-01-14')
    await secondRow.locator('details form button[type=submit]').click()

    await expect(page.locator('.badge-moved').first()).toBeVisible()
  })

  test('path 3: a message travels teacher -> student and student -> teacher, surviving a reconnect', async ({ browser }) => {
    const teacherContext = await browser.newContext()
    const studentContext = await browser.newContext()
    const teacherPage = await teacherContext.newPage()
    const studentPage = await studentContext.newPage()

    await login(teacherPage, TEACHER_USERNAME, TEACHER_PASSWORD)
    await login(studentPage, studentUsername, studentNewPassword)

    await teacherPage.goto(`/students/${studentId}?tab=chat`)
    await studentPage.goto('/me/chat')

    const teacherMessage = `hello from teacher ${Date.now()}`
    await teacherPage.locator('.chat-composer input').fill(teacherMessage)
    await teacherPage.locator('.chat-composer button[type=submit]').click()

    await expect(studentPage.locator('.chat-message', { hasText: teacherMessage })).toBeVisible({ timeout: 10000 })

    // Deliberately drop the SSE connection, send a message while it's
    // down, then restore it and confirm the gap is filled on reconnect
    // (design spec §5.4: "refetch history so no message is missed").
    await studentPage.route('**/api/chat/**/stream**', (route) => route.abort())
    await studentPage.waitForTimeout(500)

    const duringOutageMessage = `sent during outage ${Date.now()}`
    await teacherPage.locator('.chat-composer input').fill(duringOutageMessage)
    await teacherPage.locator('.chat-composer button[type=submit]').click()

    await studentPage.unroute('**/api/chat/**/stream**')

    await expect(studentPage.locator('.chat-message', { hasText: duringOutageMessage })).toBeVisible({ timeout: 15000 })

    const studentMessage = `hello from student ${Date.now()}`
    await studentPage.locator('.chat-composer input').fill(studentMessage)
    await studentPage.locator('.chat-composer button[type=submit]').click()

    await expect(teacherPage.locator('.chat-message', { hasText: studentMessage })).toBeVisible({ timeout: 10000 })

    await teacherContext.close()
    await studentContext.close()
  })
})
