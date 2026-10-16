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
