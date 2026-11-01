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
  private readonly reveal = this.locatorForOptional('[data-testid="textField.reveal"]')

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

  /** The input's current type (`password` turns into `text` while revealed). */
  async getType(): Promise<string> {
    return (await this.input()).getProperty<string>('type')
  }

  /** Whether the field offers the show/hide password toggle. */
  async isRevealable(): Promise<boolean> {
    return (await this.reveal()) !== null
  }

  async isRevealed(): Promise<boolean> {
    const toggle = await this.reveal()
    return toggle ? (await toggle.getAttribute('aria-pressed')) === 'true' : false
  }

  async getRevealLabel(): Promise<string | null> {
    return (await this.reveal())?.getAttribute('aria-label') ?? null
  }

  async toggleReveal(): Promise<void> {
    const toggle = await this.reveal()
    if (!toggle) {
      throw new Error('This text field has no show/hide password toggle')
    }
    await toggle.click()
  }
}
