import { ComponentHarness } from '@angular/cdk/testing'
import { TextFieldHarness } from '../text-field/text-field.harness'

/** Locate with `TestbedHarnessEnvironment.documentRootLoader(fixture)`: sheets live in the overlay. */
export class SelectSheetHarness extends ComponentHarness {
  static hostSelector = 'app-select-sheet'

  private readonly options = this.locatorForAll('[role="option"]')

  async getOptions(): Promise<string[]> {
    const options = await this.options()
    return Promise.all(options.map(async (option) => (await option.text()).trim()))
  }

  async getSelected(): Promise<string | null> {
    for (const option of await this.options()) {
      if ((await option.getAttribute('aria-selected')) === 'true') {
        return (await option.text()).trim()
      }
    }
    return null
  }

  async hasSearch(): Promise<boolean> {
    return (await this.locatorForOptional(TextFieldHarness)()) !== null
  }

  async search(query: string): Promise<void> {
    await (await this.locatorFor(TextFieldHarness)()).setValue(query)
  }

  async choose(label: string): Promise<void> {
    for (const option of await this.options()) {
      if ((await option.text()).trim().startsWith(label)) {
        await option.click()
        return
      }
    }
    throw new Error(`No option labelled "${label}"`)
  }
}
