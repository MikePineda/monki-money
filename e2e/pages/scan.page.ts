import { expect, type Page } from '@playwright/test'

/** `/scan`: the capture (camera or library, progress, problems) and the review of the draft. */
export class ScanPage {
  constructor(private readonly page: Page) {}

  get problem() {
    return this.page.getByTestId('scan.capture.problem')
  }
  get confidence() {
    return this.page.getByTestId('scan.review.confidence')
  }
  /** The hero amount of the review form. */
  get amount() {
    return this.page.locator('[data-testid="transactions.form.amount"] app-amount-display')
  }
  get payee() {
    return this.page.getByTestId('transactions.form.payee').locator('input')
  }
  get category() {
    return this.page.getByTestId('transactions.form.category')
  }
  get lines() {
    return this.page.getByTestId('scan.line')
  }
  get saveButton() {
    return this.page.getByTestId('scan.review.save')
  }
  /** The reduced photo shown next to the fields once "Show photo" is on. */
  get photo() {
    return this.page.getByTestId('scan.review.photo')
  }

  async showPhoto(): Promise<void> {
    await this.page.getByTestId('scan.review.photoToggle').click()
    await expect(this.photo).toBeVisible()
  }

  async goto(): Promise<void> {
    await this.page.goto('/scan')
    await expect(this.page.getByTestId('scan.capture.camera')).toBeVisible()
  }

  /** Picks a photo through "Choose from library" and waits for the review. */
  async upload(photo: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await this.page.getByTestId('scan.capture.libraryInput').setInputFiles(photo)
    await expect(this.saveButton).toBeVisible({ timeout: 30_000 })
  }

  async splitByLines(): Promise<void> {
    await this.page.getByTestId('scan.review.split').getByText('Split by lines').click()
    await expect(this.page.getByTestId('scan.review.lines')).toBeVisible()
  }

  /** Saves and waits for the screen to leave (to the month when /scan was opened directly). */
  async save(): Promise<void> {
    await expect(this.saveButton).toBeEnabled()
    const saved = this.page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/transactions') && response.request().method() === 'POST'
    )
    await this.saveButton.click()
    expect((await saved).status()).toBe(201)
    await expect(this.page).toHaveURL(/\/month$/)
  }
}
