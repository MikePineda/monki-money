import { expect, type Page } from '@playwright/test'

type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00'

/** `/add`: the type segment, hero amount, keypad, category grid, save and the toast. */
export class QuickAddPage {
  constructor(private readonly page: Page) {}

  get amount() {
    return this.page.getByTestId('quickAdd.amount')
  }
  get save() {
    return this.page.getByTestId('quickAdd.save')
  }
  get done() {
    return this.page.getByTestId('quickAdd.done')
  }
  get from() {
    return this.page.getByTestId('quickAdd.from')
  }
  get to() {
    return this.page.getByTestId('quickAdd.to')
  }
  get toast() {
    return this.page.locator('app-toast')
  }

  async goto(type?: 'expense' | 'income' | 'transfer'): Promise<void> {
    await this.page.goto(type ? `/add?type=${type}` : '/add')
    await this.waitReady()
  }

  /** The form is on screen with the household's accounts loaded. */
  async waitReady(): Promise<void> {
    await expect(this.page.getByTestId('quickAdd.kind')).toBeVisible()
  }

  async chooseKind(label: 'Expense' | 'Income' | 'Transfer'): Promise<void> {
    await this.page.getByTestId('quickAdd.kind').getByRole('radio', { name: label }).click()
  }

  async press(...keys: Key[]): Promise<void> {
    const keypad = this.page.getByTestId('quickAdd.keypad')
    for (const key of keys) {
      await keypad.locator(`button[data-key="${key}"]`).click()
    }
  }

  /** Taps the n-th category tile (0 = the most used). */
  async tapCategory(index = 0): Promise<void> {
    await this.page.getByTestId('quickAdd.categories').locator('[data-category]').nth(index).click()
  }

  /** Saves and waits for the "Saved · Undo" toast and the cleared amount. */
  async saveAndConfirm(): Promise<void> {
    await this.save.click()
    await expect(this.toast).toContainText('Saved')
    await expect(this.amount).toHaveText('$0.00')
  }
}
