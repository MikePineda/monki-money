import { expect, type Page } from '@playwright/test'

/** `/verify-email`: "check your email", with the 6-digit code field. */
export class VerifyEmailPage {
  constructor(private readonly page: Page) {}

  get pending() {
    return this.page.getByTestId('verify.pending')
  }
  get codeField() {
    return this.page.getByTestId('verify.code')
  }
  get code() {
    return this.codeField.locator('input')
  }

  /** Types (fills) the code; six digits submit themselves. */
  async enterCode(code: string): Promise<void> {
    await expect(this.pending).toBeVisible()
    await this.code.fill(code)
  }
}
