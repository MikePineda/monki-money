import { LoginPage } from '../pages/login.page.ts'
import { SettingsPage } from '../pages/settings.page.ts'
import { expect, signUpOwner, test } from '../support/fixtures.ts'

test.describe('settings: change password', () => {
  test('a temporary password is replaced and only the new one works', async ({ page }) => {
    const owner = await signUpOwner(page.context())
    const settings = new SettingsPage(page)
    const login = new LoginPage(page)
    const newPassword = 'a-brand-new-password'

    await settings.goto()
    await settings.changePassword(owner.password, newPassword)
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.locator('app-toast')).toContainText('Password changed.')

    // This device stays logged in; log out and back in with each password.
    await settings.logout.click()
    await expect(page).toHaveURL(/\/login$/)
    await login.logIn(owner.email, owner.password)
    await expect(login.error).toContainText('Email or password is incorrect.')
    await login.logIn(owner.email, newPassword)
    await expect(page).toHaveURL(/\/month$/)
  })
})
