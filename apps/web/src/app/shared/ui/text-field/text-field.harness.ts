import { ComponentHarness, HarnessPredicate, type BaseHarnessFilters } from '@angular/cdk/testing'

export interface TextFieldHarnessFilters extends BaseHarnessFilters {
  label?: string | RegExp
}

export class TextFieldHarness extends ComponentHarness {
  static hostSelector = 'app-text-field'

  static with(options: TextFieldHarnessFilters = {}): HarnessPredicate<TextFieldHarness> {
    return new HarnessPredicate(TextFieldHarness, options).addOption(
      'label',
      options.label,
      (harness, label) => HarnessPredicate.stringMatches(harness.getLabel(), label)
    )
  }

  private readonly input = this.locatorFor('input')
  private readonly message = this.locatorForOptional('p')

  async getLabel(): Promise<string> {
    return (await this.locatorFor('label')()).text()
  }

  async getValue(): Promise<string> {
    return (await this.input()).getProperty<string>('value')
  }

  async setValue(value: string): Promise<void> {
    const input = await this.input()
    await input.clear()
    if (value) {
      await input.sendKeys(value)
    }
  }

  async blur(): Promise<void> {
    await (await this.input()).blur()
  }

  async isInvalid(): Promise<boolean> {
    return (await (await this.input()).getAttribute('aria-invalid')) === 'true'
  }

  /** The error or hint text under the field, if any. */
  async getMessage(): Promise<string | null> {
    const message = await this.message()
    return message ? message.text() : null
  }
}
