import { LoginPage } from '../pages/login.page.ts'
import { SEEDED_OWNER, expect, test } from '../support/fixtures.ts'

test.describe('journey 1: login and session expiry', () => {
  test('a guest is sent to login, logs in and lands on the month', async ({ page }) => {
    const login = new LoginPage(page)

    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await login.logIn(SEEDED_OWNER.email, SEEDED_OWNER.password)

    await expect(page).toHaveURL(/\/month$/)
    await expect(page.getByTestId('app.shell')).toBeVisible()
    await expect(page.getByTestId('month.empty')).toBeVisible()
  })

  test('wrong credentials show one generic message', async ({ page }) => {
    const login = new LoginPage(page)

    await login.goto()
    await login.logIn(SEEDED_OWNER.email, 'not-the-password')

    await expect(login.error).toContainText('Email or password is incorrect.')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('an expired session goes back to login quietly and returns afterwards', async ({
    page,
    context,
  }) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.logIn(SEEDED_OWNER.email, SEEDED_OWNER.password)
    await expect(page).toHaveURL(/\/month$/)
    // Let the month's own requests finish: a response still in flight would
    // set the (cookie-store) session cookie again right after it is cleared.
    await page.waitForLoadState('networkidle')

    // The session cookie disappears (expired or revoked elsewhere).
    await context.clearCookies()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()

    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fsettings$/)
    await expect(page.locator('app-toast')).toHaveCount(0)

    await login.logIn(SEEDED_OWNER.email, SEEDED_OWNER.password)
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByTestId('settings.profile')).toBeVisible()
  })
})
