import { expect, type Page } from '@playwright/test'

/** `/signup`: name, email, password, terms and submit. */
export class SignupPage {
  constructor(private readonly page: Page) {}

  get name() {
    return this.page.getByTestId('signup.name').locator('input')
  }
  get email() {
    return this.page.getByTestId('signup.email').locator('input')
  }
  get password() {
    return this.page.getByTestId('signup.password').locator('input')
  }
  get terms() {
    return this.page.getByTestId('signup.terms').locator('input[type="checkbox"]')
  }
  get submit() {
    return this.page.getByTestId('signup.submit')
  }

  async goto(): Promise<void> {
    await this.page.goto('/signup')
    await expect(this.submit).toBeVisible()
  }

  /**
   * Fills the form, submits it and waits for the API's answer: the server
   * hashes the password, which takes seconds under load, so the checks that
   * follow never race that answer against their own timeout (as LoginPage).
   */
  async signUp(account: { fullName: string; email: string; password: string }): Promise<void> {
    await this.name.fill(account.fullName)
    await this.email.fill(account.email)
    await this.password.fill(account.password)
    await this.terms.check()
    const answered = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/auth/signup'
    )
    await this.submit.click()
    await answered
  }
}
