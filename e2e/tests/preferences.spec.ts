import { LoginPage } from '../pages/login.page.ts'
import { SettingsPage } from '../pages/settings.page.ts'
import { expect, newDevice, signUpOwner, test } from '../support/fixtures.ts'

declare global {
  interface Window {
    /** data-theme on <html> when the parser reached <body> (before the first paint). */
    __themeBeforeBody?: string | null
  }
}

test.describe('journey 7: theme and language persist', () => {
  test('dark theme and Spanish survive a reload and follow the user to a new device', async ({
    page,
    context,
    browser,
  }) => {
    const owner = await signUpOwner(context)
    const settings = new SettingsPage(page)
    await settings.goto()

    await settings.chooseTheme('Dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await settings.chooseLanguage('Español')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ajustes')

    // Same device: theme-boot.js applies the stored theme before <body> exists.
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        if (document.body) {
          window.__themeBeforeBody = document.documentElement.getAttribute('data-theme')
          observer.disconnect()
        }
      }).observe(document, { childList: true, subtree: true })
    })
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ajustes')
    expect(await page.evaluate(() => window.__themeBeforeBody)).toBe('dark')

    // Another device (fresh storage): the choices come back from the profile.
    const other = await newDevice(browser, test.info())
    const otherPage = await other.newPage()
    const login = new LoginPage(otherPage)
    await login.goto()
    await login.logIn(owner.email, owner.password)
    await expect(otherPage).toHaveURL(/\/month$/)
    await expect(otherPage.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(otherPage.locator('html')).toHaveAttribute('lang', 'es-MX')
    await other.close()
  })
})
