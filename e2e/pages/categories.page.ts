import { expect, type Locator, type Page } from '@playwright/test'

/** `/categories`: groups and their categories, reorder mode with ▲▼. */
export class CategoriesPage {
  constructor(private readonly page: Page) {}

  get list() {
    return this.page.getByTestId('categories.page')
  }
  get reorderToggle() {
    return this.page.getByTestId('categories.reorder')
  }

  /** A group's section, found by its (uppercase-styled) heading. */
  group(name: string): Locator {
    return this.page
      .locator('section[data-testid^="categories.group."]')
      .filter({ has: this.page.getByRole('heading', { name, exact: true }) })
  }

  async goto(): Promise<void> {
    await this.page.goto('/categories')
    await expect(this.list).toBeVisible()
  }

  /** Category names of a group, in the order shown. */
  async names(group: string): Promise<string[]> {
    const names = this.group(group).getByTestId('categories.name')
    return (await names.allTextContents()).map((text) => text.trim())
  }

  async startReordering(): Promise<void> {
    await this.reorderToggle.click()
    await expect(this.reorderToggle).toHaveAttribute('aria-pressed', 'true')
  }

  async moveDown(name: string): Promise<void> {
    await this.page.getByRole('button', { name: `Move ${name} down`, exact: true }).click()
  }

  async moveUp(name: string): Promise<void> {
    await this.page.getByRole('button', { name: `Move ${name} up`, exact: true }).click()
  }
}
