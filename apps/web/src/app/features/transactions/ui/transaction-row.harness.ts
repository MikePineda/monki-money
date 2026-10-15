import { ComponentHarness, HarnessPredicate, type BaseHarnessFilters } from '@angular/cdk/testing'

export interface TransactionRowHarnessFilters extends BaseHarnessFilters {
  title?: string | RegExp
}

export class TransactionRowHarness extends ComponentHarness {
  static hostSelector = 'app-transaction-row'

  static with(options: TransactionRowHarnessFilters = {}) {
    return new HarnessPredicate(TransactionRowHarness, options).addOption(
      'title',
      options.title,
      (harness, title) => HarnessPredicate.stringMatches(harness.getTitle(), title)
    )
  }

  private readonly button = this.locatorFor('button')

  async getTitle(): Promise<string> {
    return (await this.locatorFor('.row-title')()).text()
  }

  async getMeta(): Promise<string> {
    return (await this.locatorFor('.row-meta')()).text()
  }

  async getAmount(): Promise<string> {
    return (await this.locatorFor('app-amount-display .text-amount')()).text()
  }

  async getAmountKind(): Promise<string | null> {
    return (await this.locatorFor('app-amount-display')()).getAttribute('data-kind')
  }

  async getIcon(): Promise<string | null> {
    return (await this.locatorFor('svg[data-icon]')()).getAttribute('data-icon')
  }

  async getPerson(): Promise<string | null> {
    const dot = await this.locatorForOptional('app-person-dot')()
    return dot ? dot.getAttribute('data-person') : null
  }

  async isMasked(): Promise<boolean> {
    return (await (await this.button()).getAttribute('data-masked')) === 'true'
  }

  async click(): Promise<void> {
    await (await this.button()).click()
  }
}
