import { ComponentHarness, HarnessPredicate, type BaseHarnessFilters } from '@angular/cdk/testing'

export interface SegmentedControlHarnessFilters extends BaseHarnessFilters {
  label?: string
}

export class SegmentedControlHarness extends ComponentHarness {
  static hostSelector = 'app-segmented-control'

  static with(
    options: SegmentedControlHarnessFilters = {}
  ): HarnessPredicate<SegmentedControlHarness> {
    return new HarnessPredicate(SegmentedControlHarness, options).addOption(
      'label',
      options.label,
      async (harness, label) => (await harness.getLabel()) === label
    )
  }

  private readonly radios = this.locatorForAll('[role="radio"]')

  async getLabel(): Promise<string | null> {
    return (await this.locatorFor('[role="radiogroup"]')()).getAttribute('aria-label')
  }

  async getOptions(): Promise<string[]> {
    return Promise.all((await this.radios()).map((radio) => radio.text()))
  }

  async getSelected(): Promise<string | null> {
    for (const radio of await this.radios()) {
      if ((await radio.getAttribute('aria-checked')) === 'true') {
        return radio.text()
      }
    }
    return null
  }

  async select(label: string): Promise<void> {
    for (const radio of await this.radios()) {
      if ((await radio.text()) === label) {
        await radio.click()
        return
      }
    }
    throw new Error(`No segment labelled "${label}"`)
  }
}
