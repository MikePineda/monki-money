import { expect, type Page } from '@playwright/test'

/** `/login`: email, password, submit, the error banner and the sign-up link. */
export class LoginPage {
  constructor(private readonly page: Page) {}

  get email() {
    return this.page.getByTestId('login.email').locator('input')
  }
  get password() {
    return this.page.getByTestId('login.password').locator('input')
  }
  get submit() {
    return this.page.getByTestId('login.submit')
  }
  get error() {
    return this.page.getByTestId('login.error')
  }

  async goto(): Promise<void> {
    await this.page.goto('/login')
    await expect(this.submit).toBeVisible()
  }

  /**
   * Fills the form, submits it and waits for the API's answer. The server
   * hashes the password, which takes seconds while every worker logs in at
   * once, so the checks that follow never race that answer against their
   * own timeout.
   */
  async logIn(email: string, password: string): Promise<void> {
    await this.email.fill(email)
    await this.password.fill(password)
    const answered = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/auth/login'
    )
    await this.submit.click()
    await answered
  }
}
