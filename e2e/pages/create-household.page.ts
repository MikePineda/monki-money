import { expect, type Page } from '@playwright/test'

/** `/household/new`: "create your household", or join one with an invitation link. */
export class CreateHouseholdPage {
  constructor(private readonly page: Page) {}

  get title() {
    return this.page.getByTestId('createHousehold.title')
  }
  get name() {
    return this.page.getByTestId('createHousehold.name').locator('input')
  }
  get submit() {
    return this.page.getByTestId('createHousehold.submit')
  }

  async create(name: string): Promise<void> {
    await expect(this.title).toBeVisible()
    await expect(this.page.getByTestId('onboarding.currency')).toContainText('AUD')
    await this.name.fill(name)
    await this.submit.click()
  }
}
