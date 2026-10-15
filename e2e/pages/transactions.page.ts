import { expect, type Locator, type Page } from '@playwright/test'

type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | 'backspace'

/** `/transactions`: the list, the transaction sheet over it and the split sheet. */
export class TransactionsPage {
  constructor(private readonly page: Page) {}

  get list() {
    return this.page.getByTestId('transactions.list')
  }
  get empty() {
    return this.page.getByTestId('transactions.empty')
  }
  get editSheet() {
    return this.page.getByTestId('transactions.edit')
  }
  get splitStatus() {
    return this.page.getByTestId('transactions.split.status')
  }
  get toast() {
    return this.page.locator('app-toast')
  }

  row(text: string): Locator {
    return this.page.getByTestId('transactions.row').filter({ hasText: text })
  }

  async goto(): Promise<void> {
    await this.page.goto('/transactions')
    await expect(this.page.getByTestId('transactions.header')).toBeVisible()
  }

  async open(text: string): Promise<void> {
    await this.row(text).click()
    await expect(this.page).toHaveURL(/\/transactions\/\d+$/)
    await expect(this.page.getByTestId('transactions.form.amount')).toBeVisible()
  }

  /** Clears the amount on the form keypad and types a new one ("6000" = $60.00). */
  async typeAmount(digits: string): Promise<void> {
    await this.page.getByTestId('transactions.form.amount').click()
    const keypad = this.page.getByTestId('transactions.form.keypad')
    await expect(keypad).toBeVisible()
    for (let index = 0; index < 8; index++) {
      await this.press(keypad, 'backspace')
    }
    for (const digit of digits) {
      await this.press(keypad, digit as Key)
    }
  }

  async save(): Promise<void> {
    await this.page.getByTestId('transactions.edit.save').click()
  }

  async openSplit(): Promise<void> {
    await this.page.getByTestId('transactions.form.split').click()
    await expect(this.page.getByTestId('transactions.split.lines')).toBeVisible()
  }

  /** Types the amount of the selected split line (the first one when the sheet opens). */
  async typeSplitAmount(digits: string): Promise<void> {
    const keypad = this.page.getByTestId('transactions.split.keypad')
    for (const digit of digits) {
      await this.press(keypad, digit as Key)
    }
  }

  async chooseSplitCategory(line: number, name: string): Promise<void> {
    await this.page.getByTestId(`transactions.split.category.${line}`).click()
    await this.page.getByRole('option', { name: new RegExp(`^${name}`) }).click()
  }

  /** Saves the split and waits for the API's answer (`PUT /transactions/:id/splits`). */
  async saveSplit(): Promise<void> {
    const saved = this.page.waitForResponse(
      (response) =>
        /\/api\/v1\/transactions\/\d+\/splits$/.test(response.url()) &&
        response.request().method() === 'PUT'
    )
    await this.page.getByTestId('transactions.split.save').click()
    expect((await saved).status()).toBe(200)
  }

  async closeSheet(): Promise<void> {
    await this.page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click()
    await expect(this.page).toHaveURL(/\/transactions$/)
  }

  private async press(keypad: Locator, key: Key): Promise<void> {
    await keypad.locator(`button[data-key="${key}"]`).click()
  }
}
