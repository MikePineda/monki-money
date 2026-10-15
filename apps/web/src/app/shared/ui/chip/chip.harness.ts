import { ComponentHarness, HarnessPredicate, type BaseHarnessFilters } from '@angular/cdk/testing'

export interface ChipHarnessFilters extends BaseHarnessFilters {
  text?: string | RegExp
}

export class ChipHarness extends ComponentHarness {
  static hostSelector = '[appChip]'

  static with(options: ChipHarnessFilters = {}): HarnessPredicate<ChipHarness> {
    return new HarnessPredicate(ChipHarness, options).addOption(
      'text',
      options.text,
      (harness, text) => HarnessPredicate.stringMatches(harness.getText(), text)
    )
  }

  async getText(): Promise<string> {
    return (await this.host()).text()
  }

  /** Selected state as announced (`aria-pressed`), or null for a non-toggle chip. */
  async isPressed(): Promise<boolean | null> {
    const pressed = await (await this.host()).getAttribute('aria-pressed')
    return pressed === null ? null : pressed === 'true'
  }

  async hasCheckmark(): Promise<boolean> {
    return (await this.locatorForAll('svg[data-icon="check"]')()).length > 0
  }

  async click(): Promise<void> {
    await (await this.host()).click()
  }
}
