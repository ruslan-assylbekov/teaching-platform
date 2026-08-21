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

  test('path 4: master calendar books a slot, then a cancellation and a move both apply', async ({ page }) => {
    await login(page, TEACHER_USERNAME, TEACHER_PASSWORD)
    await page.goto('/schedule')

    // Structural selectors throughout (row by its time label, column by
    // position, dialog by its native `open` attribute), not translated
    // button/link text -- the teacher's default locale is 'ru' (see path
    // 1's comment). `dialog[open].modal` narrows to whichever modal is
    // currently topmost; `.last()` picks the ConfirmDialog over the
    // occurrence panel underneath it when both are open at once (native
    // <dialog> stacks rather than replacing).
    const mondayColumn = 0
    const row = page.locator('table.schedule-grid tbody tr', { has: page.locator('th', { hasText: '17:00' }) })

    await row.locator('td').nth(mondayColumn).locator('button.grid-cell-empty').click()
    await page.locator('dialog[open].modal').last().getByRole('button', { name: studentFullName }).click()
    await page.locator('dialog[open].modal').last().locator('button[type=submit]').click()

    // Back on the grid: the slot now occupies Monday 17:00.
    const occupiedCell = row.locator('td').nth(mondayColumn).locator('button.grid-cell')
    await expect(occupiedCell).toBeVisible()

    // Cancel this week's occurrence, gated by the confirm dialog (requirement:
    // no destructive schedule action fires without an explicit confirm step).
    await occupiedCell.click()
    await page.locator('dialog[open].modal').last().locator('button.button-secondary').click()
    await page.locator('dialog[open].modal').last().locator('button.button-danger').click()
    await expect(row.locator('td').nth(mondayColumn).locator('.badge-cancelled')).toBeVisible()

    // The cancellation is scoped to this week's date only -- next week's
    // occurrence of the same recurring slot is untouched. Move that one.
    await page.locator('nav.week-nav a').nth(2).click()
    const nextWeekRow = page.locator('table.schedule-grid tbody tr', { has: page.locator('th', { hasText: '17:00' }) })
    await nextWeekRow.locator('td').nth(mondayColumn).locator('button.grid-cell').click()

    const futureDate = (() => {
      const date = new Date()
      date.setDate(date.getDate() + 30)
      return date.toISOString().slice(0, 10)
    })()
    const movePanel = page.locator('dialog[open].modal').last()
    await movePanel.locator('details').nth(0).locator('summary').click()
    await movePanel.locator('details').nth(0).locator('input[name="newDate"]').fill(futureDate)
    await movePanel.locator('details').nth(0).locator('button[type=submit]').click()

    await expect(nextWeekRow.locator('td').nth(mondayColumn).locator('.badge-moved')).toBeVisible()
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
