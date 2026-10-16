import { expect, type Locator, type Page } from '@playwright/test'

/** `/import`, `/import/:id` and `/import/:id/result`: upload, review (with its sheets), result. */
export class ImportPage {
  constructor(private readonly page: Page) {}

  get reviewList() {
    return this.page.getByTestId('import.review.list')
  }
  get summary() {
    return this.page.getByTestId('import.review.summary')
  }
  get confirmButton() {
    return this.page.getByTestId('import.review.confirm')
  }
  get reconciliation() {
    return this.page.getByTestId('import.result.reconciliation')
  }
  get created() {
    return this.page.getByTestId('import.result.headline')
  }
  /** The rows the list shows now. */
  get rows() {
    return this.reviewList.getByTestId('import.row')
  }
  get toast() {
    return this.page.locator('app-toast')
  }

  /** A review row by its title (merchant or bank text). */
  row(text: string): Locator {
    return this.page.getByTestId('import.row').filter({ hasText: text })
  }

  /** Ticks a review row's checkbox (its list item holds the checkbox and the row). */
  async select(text: string): Promise<void> {
    await this.page
      .getByTestId('review.item')
      .filter({ has: this.row(text) })
      .getByTestId('review.check')
      .check()
  }

  /** The duplicates chip of the summary: lists the duplicates, or back to every row. */
  async toggleDuplicates(): Promise<void> {
    const chip = this.page.getByTestId('import.review.duplicates')
    const pressed = await chip.getAttribute('aria-pressed')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true')
  }

  /** "Ignore" in the bulk bar, and the one request that saves it. */
  async ignoreSelected(): Promise<void> {
    const saved = this.page.waitForResponse(
      (response) =>
        /\/api\/v1\/imports\/\d+\/rows$/.test(response.url()) &&
        response.request().method() === 'PATCH'
    )
    await this.page.getByTestId('import.review.bulk.ignore').click()
    expect((await saved).ok()).toBe(true)
  }

  /** "Undo" in the toast of the last bulk action, and the one request that saves it. */
  async undo(): Promise<void> {
    const saved = this.page.waitForResponse(
      (response) =>
        /\/api\/v1\/imports\/\d+\/rows$/.test(response.url()) &&
        response.request().method() === 'PATCH'
    )
    await this.toast.getByRole('button', { name: 'Undo' }).click()
    expect((await saved).ok()).toBe(true)
    await expect(this.toast).toContainText('Changes undone.')
  }

  async goto(): Promise<void> {
    await this.page.goto('/import')
    await expect(this.page.getByTestId('import.upload.choose')).toBeVisible()
  }

  /** Picks the CSV (the button opens this input) and waits for the review screen. */
  async upload(path: string): Promise<void> {
    await this.page.getByTestId('import.upload.file').setInputFiles(path)
    await expect(this.page).toHaveURL(/\/import\/\d+$/)
    await expect(this.reviewList).toBeVisible()
  }

  /** "Accept suggested (n)" and the row decisions it sends. */
  async acceptSuggested(count: number): Promise<void> {
    const button = this.page.getByTestId('import.review.acceptAll')
    await expect(button).toHaveText(`Accept suggested (${count})`)
    await button.click()
    await expect(this.page.getByTestId('import.review.acceptAll')).toBeHidden()
  }

  /** Opens a row's triage sheet. */
  async open(text: string): Promise<void> {
    await this.row(text).click()
    await expect(this.page.getByTestId('import.triage.done')).toBeVisible()
  }

  /** In the open triage sheet: picks a category and waits for the row decision. */
  async chooseCategory(name: string): Promise<void> {
    await this.page.getByTestId('import.triage.category').click()
    const saved = this.page.waitForResponse(
      (response) =>
        /\/api\/v1\/imports\/\d+\/rows\/\d+$/.test(response.url()) &&
        response.request().method() === 'PATCH'
    )
    await this.page.getByRole('option', { name: new RegExp(`^${name}`) }).click()
    expect((await saved).ok()).toBe(true)
  }

  async closeSheet(): Promise<void> {
    await this.page.getByTestId('import.triage.done').click()
    await expect(this.page.getByTestId('import.triage.done')).toBeHidden()
  }

  /** Confirms the import and waits for the result screen. */
  async confirm(): Promise<void> {
    await expect(this.confirmButton).toBeEnabled()
    await this.confirmButton.click()
    await expect(this.page).toHaveURL(/\/import\/\d+\/result$/)
    await expect(this.reconciliation).toBeVisible()
  }

  async viewMonth(): Promise<void> {
    await this.page.getByTestId('import.result.month').click()
    await expect(this.page).toHaveURL(/\/month\/\d{4}-\d{2}$/)
  }
}
