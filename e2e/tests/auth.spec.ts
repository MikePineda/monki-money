import { LoginPage } from '../pages/login.page.ts'
import { apiRequestsSettled, countApiRequests } from '../support/api-requests.ts'
import { SEEDED_OWNER, expect, test } from '../support/fixtures.ts'
import { TURNSTILE_DUMMY_TOKEN } from '../support/turnstile.ts'

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
    await countApiRequests(page)
    await login.goto()
    await login.logIn(SEEDED_OWNER.email, SEEDED_OWNER.password)
    await expect(page).toHaveURL(/\/month$/)
    // Let the month's own requests finish: a response still in flight would
    // set the (cookie-store) session cookie again right after it is cleared,
    // and one sent after it would expire the session from /month instead.
    // The empty month is drawn once its report is in, and the household
    // directory it also loads was asked for alongside it, so after that every
    // request the screen makes has been sent: wait until all are answered.
    // (`networkidle` cannot tell: it belongs to the document, which may have
    // reached it on /login before the in-app navigation to /month.)
    await expect(page.getByTestId('month.empty')).toBeVisible()
    await apiRequestsSettled(page)

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

test.describe('journey 1b: the bot check on login', () => {
  test('the login waits for the Turnstile token and sends it', async ({ page }) => {
    const login = new LoginPage(page)
    // Chromium does not expose fetch bodies to Playwright (the client streams
    // them), so the page records the login body itself.
    await page.addInitScript(() => {
      const send = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        const request = new Request(input, init)
        if (request.url.endsWith('/api/v1/auth/login')) {
          sessionStorage.setItem('e2e:loginBody', await request.clone().text())
        }
        return send(request)
      }
    })

    await login.goto()
    // e2e.env sets a site key, so the widget renders (through the stand-in).
    await expect(page.getByTestId('login.turnstile').getByTestId('turnstile.host')).toHaveAttribute(
      'data-turnstile',
      'e2e'
    )
    await login.logIn(SEEDED_OWNER.email, SEEDED_OWNER.password)

    await expect(page).toHaveURL(/\/month$/)
    const body = await page.evaluate(() => sessionStorage.getItem('e2e:loginBody'))
    expect(JSON.parse(body ?? '{}')).toMatchObject({ turnstileToken: TURNSTILE_DUMMY_TOKEN })
  })
})
