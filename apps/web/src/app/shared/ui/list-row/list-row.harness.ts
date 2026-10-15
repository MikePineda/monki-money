import { ComponentHarness, HarnessPredicate, type BaseHarnessFilters } from '@angular/cdk/testing'

export interface ListRowHarnessFilters extends BaseHarnessFilters {
  title?: string | RegExp
}

export class ListRowHarness extends ComponentHarness {
  static hostSelector = 'app-list-row'

  static with(options: ListRowHarnessFilters = {}): HarnessPredicate<ListRowHarness> {
    return new HarnessPredicate(ListRowHarness, options).addOption(
      'title',
      options.title,
      (harness, title) => HarnessPredicate.stringMatches(harness.getTitle(), title)
    )
  }

  async getTitle(): Promise<string> {
    return (await this.locatorFor('.text-body')()).text()
  }

  async getMeta(): Promise<string | null> {
    const meta = await this.locatorForOptional('.text-caption .truncate')()
    return meta ? meta.text() : null
  }

  async getAmount(): Promise<string | null> {
    const amount = await this.locatorForOptional('app-amount-display')()
    return amount ? amount.text() : null
  }

  async isInteractive(): Promise<boolean> {
    return (await this.locatorForOptional('button')()) !== null
  }

  async click(): Promise<void> {
    await (await this.locatorFor('button')()).click()
  }
}
