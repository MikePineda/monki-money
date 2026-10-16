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
  get leave() {
    return this.page.getByTestId('settings.leave')
  }
  get makeOwner() {
    return this.page.getByTestId('settings.makeOwner')
  }
  get logout() {
    return this.page.getByTestId('settings.logout')
  }
  get categories() {
    return this.page.getByTestId('settings.categories')
  }
  get goals() {
    return this.page.getByTestId('settings.goals')
  }

  /**
   * Opens the More tab once it has settled. The member list arrives after
   * the page is drawn and pushes every row below it down: a click there
   * while it lands can press one row and release on another, and the click
   * then reaches neither link.
   */
  async goto(): Promise<void> {
    await this.page.goto('/settings')
    await expect(this.profile).toBeVisible()
    await expect(this.members.getByRole('listitem').first()).toBeVisible()
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

  /**
   * The owner hands the household over to the partner, confirming with a
   * password. A value typed while the sheet is still binding its form can be
   * reset to the empty model, so the fill is repeated until the confirm
   * button takes it.
   */
  async makePartnerOwner(password: string): Promise<void> {
    await this.makeOwner.click()
    const input = this.page.getByTestId('ownership.password').locator('input')
    const confirm = this.page.getByTestId('ownership.confirm')
    await expect(async () => {
      await input.fill(password)
      await expect(confirm).toBeEnabled({ timeout: 1_000 })
    }).toPass()
    await confirm.click()
  }

  /** A member leaves from the danger zone, confirming in the sheet. */
  async leaveHousehold(): Promise<void> {
    await this.page.getByTestId('settings.leave').click()
    await this.page.getByTestId('leave.confirm').click()
  }

  async changePassword(current: string, next: string): Promise<void> {
    await this.page.getByTestId('settings.password').click()
    await expect(this.page).toHaveURL(/\/settings\/password$/)
    await this.page.getByTestId('password.current').locator('input').fill(current)
    await this.page.getByTestId('password.new').locator('input').fill(next)
    await this.page.getByTestId('password.submit').click()
  }
}
