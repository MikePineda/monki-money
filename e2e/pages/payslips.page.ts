import { expect, type Page } from '@playwright/test'

type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00'

/** `/settings/accounts/:accountId/payslips`: an account's payslips (reached from its row in Accounts). */
export class PayslipsPage {
  constructor(private readonly page: Page) {}

  get list() {
    return this.page.getByTestId('payslips.page')
  }
  get empty() {
    return this.page.getByTestId('payslips.empty')
  }
  get addButton() {
    return this.page.getByTestId('payslips.add')
  }
  get cards() {
    return this.page.locator('app-payslip-card')
  }

  /** Settings → Accounts → the Payslips row of the account named `accountName`. */
  async openFromAccounts(accountName: string): Promise<void> {
    await this.page.goto('/settings/accounts')
    const row = this.page.locator('app-card', { hasText: accountName })
    await row.getByTestId('accounts.payslips').click()
    await expect(this.page).toHaveURL(/\/settings\/accounts\/\d+\/payslips$/)
    await this.waitReady()
  }

  async waitReady(): Promise<void> {
    await expect(this.list).toBeVisible()
    await expect(this.page.getByTestId('payslips.loading')).toHaveCount(0)
  }
}

/** `/settings/accounts/:accountId/payslips/new`: the payslip form. */
export class PayslipFormPage {
  constructor(private readonly page: Page) {}

  get form() {
    return this.page.getByTestId('payslips.new')
  }
  get fee() {
    return this.page.getByTestId('payslips.form.fee')
  }
  get submit() {
    return this.page.getByTestId('payslips.form.submit')
  }

  async waitReady(): Promise<void> {
    await expect(this.submit).toBeVisible()
  }

  /** The candidate transfer whose label contains `text` ("$3,700.00"). */
  candidate(text: string) {
    return this.form.getByRole('radio', { name: new RegExp(text.replace(/[$.]/g, '\\$&')) })
  }

  /** Types an amount with the keypad of a money field (gross, tax, net, extra). */
  async amount(field: 'gross' | 'tax' | 'net' | 'extra', ...keys: KeypadKey[]): Promise<void> {
    const button = this.page.getByTestId(`payslips.form.${field}`)
    if ((await button.getAttribute('aria-expanded')) !== 'true') {
      await button.click()
    }
    const keypad = this.page.getByTestId(`payslips.form.${field}Keypad`)
    for (const key of keys) {
      await keypad.locator(`button[data-key="${key}"]`).click()
    }
    await button.click()
  }
}
