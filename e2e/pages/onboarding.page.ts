import { expect, type Page } from '@playwright/test'

/** `/onboarding`: the four-step wizard. */
export class OnboardingPage {
  constructor(private readonly page: Page) {}

  get root() {
    return this.page.getByTestId('onboarding.page')
  }
  get stepLabel() {
    return this.page.getByTestId('onboarding.stepLabel')
  }
  get continueButton() {
    return this.page.getByTestId('onboarding.continue')
  }
  get householdName() {
    return this.page.getByTestId('onboarding.householdName').locator('input')
  }
  get later() {
    return this.page.getByTestId('onboarding.later')
  }

  preset(id: string) {
    return this.page.getByTestId(`onboarding.preset.${id}`)
  }

  async expectStep(step: number): Promise<void> {
    await expect(this.root).toHaveAttribute('data-step', String(step))
  }

  async nameHousehold(name: string): Promise<void> {
    await this.expectStep(1)
    await this.householdName.fill(name)
    await this.continueButton.click()
  }

  async keepRegion(): Promise<void> {
    await this.expectStep(2)
    await expect(this.page.getByTestId('onboarding.currency')).toContainText('AUD')
    await this.continueButton.click()
  }

  async chooseAccounts(...presets: string[]): Promise<void> {
    await this.expectStep(3)
    await expect(this.continueButton).toBeDisabled()
    for (const id of presets) {
      await this.preset(id).click()
      await expect(this.preset(id)).toHaveAttribute('aria-pressed', 'true')
    }
    await this.continueButton.click()
  }

  async inviteLater(): Promise<void> {
    await this.expectStep(4)
    await this.later.click()
  }
}
