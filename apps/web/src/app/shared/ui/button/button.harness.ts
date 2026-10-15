import { ComponentHarness, HarnessPredicate, type BaseHarnessFilters } from '@angular/cdk/testing'

export interface ButtonHarnessFilters extends BaseHarnessFilters {
  text?: string | RegExp
  variant?: string
}

export class ButtonHarness extends ComponentHarness {
  static hostSelector = '[appButton]'

  static with(options: ButtonHarnessFilters = {}): HarnessPredicate<ButtonHarness> {
    return new HarnessPredicate(ButtonHarness, options)
      .addOption('text', options.text, (harness, text) =>
        HarnessPredicate.stringMatches(harness.getText(), text)
      )
      .addOption('variant', options.variant, async (harness, variant) => {
        return (await harness.getVariant()) === variant
      })
  }

  async getText(): Promise<string> {
    return (await this.host()).text()
  }

  async getVariant(): Promise<string | null> {
    return (await this.host()).getAttribute('data-variant')
  }

  async isLoading(): Promise<boolean> {
    return (await (await this.host()).getAttribute('aria-busy')) === 'true'
  }

  async isDisabled(): Promise<boolean> {
    return (await this.host()).getProperty<boolean>('disabled')
  }

  async hasIcon(name: string): Promise<boolean> {
    const icons = await this.locatorForAll(`svg[data-icon="${name}"]`)()
    return icons.length > 0
  }

  async click(): Promise<void> {
    await (await this.host()).click()
  }
}
