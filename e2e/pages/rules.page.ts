import { expect, type Page } from '@playwright/test'

/** `/settings/rules`: the merchant rules and the sheet that writes or edits one. */
export class RulesPage {
  constructor(private readonly page: Page) {}

  get list() {
    return this.page.getByTestId('rules.list')
  }
  get newRule() {
    return this.page.getByTestId('rules.new')
  }
  /** The rule sheet while it is open. */
  get sheet() {
    return this.page.locator('app-rule-sheet')
  }

  /** The row whose pattern reads exactly `pattern`. */
  row(pattern: string) {
    return this.page.getByTestId('rules.row').filter({
      has: this.page.getByTestId('rules.pattern').getByText(pattern, { exact: true }),
    })
  }

  async goto(): Promise<void> {
    await this.page.goto('/settings/rules')
    await expect(this.newRule).toBeVisible()
  }

  async startNew(): Promise<void> {
    await this.newRule.click()
    await expect(this.sheet.getByTestId('rules.form.save')).toBeVisible()
  }

  async chooseMatchType(label: string): Promise<void> {
    await this.sheet.getByTestId('rules.form.matchType').getByRole('radio', { name: label }).click()
  }

  async fillPattern(text: string): Promise<void> {
    await this.sheet.getByTestId('rules.form.pattern').locator('input').fill(text)
  }

  async chooseCategory(name: string): Promise<void> {
    await this.sheet.getByTestId('rules.form.category').click()
    await this.page.getByRole('option', { name: new RegExp(`^${name}`) }).click()
    await expect(this.sheet.getByTestId('rules.form.category')).toHaveText(name)
  }

  /** Saves and waits for the sheet to close; resolves with the API's status. */
  async save(): Promise<number> {
    const saved = this.page.waitForResponse(
      (response) =>
        /\/api\/v1\/rules(\/\d+)?$/.test(response.url()) &&
        ['POST', 'PATCH'].includes(response.request().method())
    )
    await this.sheet.getByTestId('rules.form.save').click()
    const status = (await saved).status()
    await expect(this.sheet).toHaveCount(0)
    return status
  }
}
