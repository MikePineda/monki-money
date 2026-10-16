import { expect, type Page } from '@playwright/test'

/** `/month/:ym?`: the month strip, the hero, the stat tiles, the empty state and the top list. */
export class MonthPage {
  constructor(private readonly page: Page) {}

  get hero() {
    return this.page.getByTestId('month.hero')
  }
  get empty() {
    return this.page.getByTestId('month.empty')
  }
  get income() {
    return this.page.getByTestId('month.stats.income')
  }
  get top() {
    return this.page.getByTestId('month.top')
  }
  get addButton() {
    return this.page.getByRole('link', { name: 'Add transaction' }).first()
  }
  /** "Committed this month" (the current month, once the household has recurring payments). */
  get committed() {
    return this.page.getByTestId('month.committed')
  }
  /** The one-line hint that offers to detect recurring payments while there are none. */
  get committedHint() {
    return this.page.getByTestId('month.committed.hint')
  }
  /** The AI-written monthly summary card in the insights slot. */
  get summary() {
    return this.page.getByTestId('month.summary')
  }
  get summaryHeadline() {
    return this.page.getByTestId('month.summary.headline')
  }

  /** "Regenerate summary" from the card's overflow menu. */
  async regenerateSummary(): Promise<void> {
    await this.page.getByTestId('month.summary.menu').click()
    await this.page.getByRole('option', { name: 'Regenerate summary' }).click()
  }

  async goto(month?: string): Promise<void> {
    await this.page.goto(month ? `/month/${month}` : '/month')
    await this.waitReady()
  }

  /** The month's numbers are on screen (fully loaded, not dimmed). */
  async waitReady(): Promise<void> {
    await expect(this.page.getByTestId('month.content')).toBeVisible()
    await expect(this.page.getByTestId('month.content')).not.toHaveAttribute('aria-busy', 'true')
  }
}
