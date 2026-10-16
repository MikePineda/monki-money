import { expect, type Locator, type Page } from '@playwright/test'

/** `/tags` (every tag with its totals) and `/tags/:tag` (one tag). */
export class TagsPage {
  constructor(private readonly page: Page) {}

  get list() {
    return this.page.getByTestId('tags.list')
  }
  get empty() {
    return this.page.getByTestId('tags.empty')
  }
  /** The tag's hero: money spent with it. */
  get spent() {
    return this.page.getByTestId('tag.spent')
  }
  get meta() {
    return this.page.getByTestId('tag.meta')
  }

  row(tag: string): Locator {
    return this.page.getByTestId('tags.row').filter({ hasText: tag })
  }

  /** More (the settings screen) → Tags. */
  async openFromMore(): Promise<void> {
    await this.page.goto('/settings')
    await this.page.getByTestId('settings.tags').click()
    await expect(this.page).toHaveURL(/\/tags$/)
    await expect(this.page.getByTestId('tags.loading')).toHaveCount(0)
    await expect(this.list.or(this.empty)).toBeVisible()
  }

  /** `/tags/<tag>`, URL-encoded. */
  async goto(tag: string): Promise<void> {
    await this.page.goto(`/tags/${encodeURIComponent(tag)}`)
    await this.waitForTag(tag)
  }

  async open(tag: string): Promise<void> {
    await this.row(tag).click()
    await this.waitForTag(tag)
  }

  /** "See these transactions": the list filtered by the tag. */
  async seeTransactions(): Promise<void> {
    await this.page.getByTestId('tag.movements').click()
    await expect(this.page.getByTestId('transactions.header')).toBeVisible()
  }

  private async waitForTag(tag: string): Promise<void> {
    await expect(this.page.getByTestId('tag.name')).toHaveText(tag)
    await expect(this.page.getByTestId('tag.loading')).toHaveCount(0)
    await expect(this.spent).toBeVisible()
  }
}
