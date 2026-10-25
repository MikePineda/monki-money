import { expect, type Locator, type Page } from '@playwright/test'

/** `/recurring`: the household's recurring payments, a row per payee. */
export class RecurringPage {
  constructor(private readonly page: Page) {}

  get list() {
    return this.page.getByTestId('recurring.list')
  }
  get empty() {
    return this.page.getByTestId('recurring.empty')
  }

  /** The row of a payee (payee, "Weekly · Next 21 Oct · Rent", amount). */
  row(payee: string): Locator {
    return this.page.getByTestId('recurring.row').filter({ hasText: payee })
  }

  /** Adds one by hand: the payee, then the amount on the keypad from the cents up ("2", "9", "9", "0"). */
  async addByHand(payee: string, keys: string[]): Promise<void> {
    await this.page.getByTestId('recurring.add').first().click()
    const sheet = this.page.locator('app-recurring-sheet')
    await sheet.getByTestId('recurring.sheet.payee').locator('input').fill(payee)
    await sheet.getByTestId('recurring.sheet.amount').click()
    for (const key of keys) {
      await sheet.getByTestId('recurring.sheet.keypad').locator(`button[data-key="${key}"]`).click()
    }
    await sheet.getByTestId('recurring.sheet.save').click()
    await expect(sheet).toBeHidden()
  }

  /** Deletes a row through its actions and the confirm sheet. */
  async delete(payee: string): Promise<void> {
    await this.row(payee).click()
    await this.page.getByRole('option', { name: 'Delete' }).click()
    await expect(this.page.getByTestId('confirm.body')).toBeVisible()
    await this.page.getByTestId('confirm.yes').click()
  }

  async goto(): Promise<void> {
    await this.page.goto('/recurring')
    await this.waitReady()
  }

  /** The list (or its empty state) is on screen. */
  async waitReady(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Recurring payments' })
    ).toBeVisible()
    await expect(this.list.or(this.empty)).toBeVisible()
  }
}
