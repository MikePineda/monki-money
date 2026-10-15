import { expect, type Page } from '@playwright/test'

/** `/invite/:token`: the invitation preview and the in-place account creation. */
export class InvitePage {
  constructor(private readonly page: Page) {}

  get title() {
    return this.page.getByTestId('invite.title')
  }
  get create() {
    return this.page.getByTestId('invite.create')
  }
  get name() {
    return this.page.getByTestId('invite.name').locator('input')
  }
  get password() {
    return this.page.getByTestId('invite.password').locator('input')
  }
  get accept() {
    return this.page.getByTestId('invite.accept')
  }

  async createAccountAndJoin(fullName: string, password: string): Promise<void> {
    await expect(this.title).toBeVisible()
    await this.create.click()
    await this.name.fill(fullName)
    await this.password.fill(password)
    await this.accept.click()
  }
}
