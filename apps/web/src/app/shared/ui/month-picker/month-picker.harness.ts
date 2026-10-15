import { ComponentHarness } from '@angular/cdk/testing'

export class MonthPickerHarness extends ComponentHarness {
  static hostSelector = 'app-month-picker'

  private readonly buttons = this.locatorForAll('button[data-month]')

  async getLabel(): Promise<string | null> {
    return (await this.locatorFor('nav')()).getAttribute('aria-label')
  }

  async getMonths(): Promise<string[]> {
    return Promise.all((await this.buttons()).map(async (button) => (await button.text()).trim()))
  }

  async getSelected(): Promise<string | null> {
    const selected = await this.locatorForOptional('button[aria-current="date"]')()
    return selected ? (await selected.text()).trim() : null
  }

  async getSelectedValue(): Promise<string | null> {
    const selected = await this.locatorForOptional('button[aria-current="date"]')()
    return selected ? selected.getAttribute('data-month') : null
  }

  async isDisabled(month: string): Promise<boolean> {
    return (await this.locatorFor(`button[data-month="${month}"]`)()).getProperty<boolean>(
      'disabled'
    )
  }

  /** Selects by value ('YYYY-MM'). */
  async select(month: string): Promise<void> {
    await (await this.locatorFor(`button[data-month="${month}"]`)()).click()
  }
}
