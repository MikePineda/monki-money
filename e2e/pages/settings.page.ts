import { expect, type Page } from '@playwright/test'

/** `/settings` (the More tab) and its password subpage. */
export class SettingsPage {
  constructor(private readonly page: Page) {}

  get profile() {
    return this.page.getByTestId('settings.profile')
  }
  get members() {
    return this.page.getByTestId('settings.members')
  }
  get theme() {
    return this.page.getByTestId('settings.theme')
  }
  get language() {
    return this.page.getByTestId('settings.language')
  }
  get invite() {
    return this.page.getByTestId('settings.invite')
  }
  get logout() {
    return this.page.getByTestId('settings.logout')
  }

  async goto(): Promise<void> {
    await this.page.goto('/settings')
    await expect(this.profile).toBeVisible()
  }

  async chooseTheme(label: string): Promise<void> {
    await this.theme.getByRole('radio', { name: label }).click()
  }

  async chooseLanguage(label: string): Promise<void> {
    await this.language.click()
    await this.page.getByRole('option', { name: label }).click()
  }

  async invitePartner(email: string): Promise<void> {
    await this.invite.click()
    await this.page.getByTestId('settings.inviteSheet.input').locator('input').fill(email)
    await this.page.getByTestId('settings.inviteSheet.submit').click()
  }

  async changePassword(current: string, next: string): Promise<void> {
    await this.page.getByTestId('settings.password').click()
    await expect(this.page).toHaveURL(/\/settings\/password$/)
    await this.page.getByTestId('password.current').locator('input').fill(current)
    await this.page.getByTestId('password.new').locator('input').fill(next)
    await this.page.getByTestId('password.submit').click()
  }
}
