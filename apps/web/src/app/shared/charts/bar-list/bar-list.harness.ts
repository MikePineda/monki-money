import { ComponentHarness } from '@angular/cdk/testing'

export interface BarListRowContent {
  label: string
  amount: string
  depth: number
  /** null when the row has no children to expand. */
  expanded: boolean | null
}

export class BarListHarness extends ComponentHarness {
  static hostSelector = 'app-bar-list'

  async getRows(): Promise<BarListRowContent[]> {
    const [rows, labels, amounts] = await Promise.all([
      this.locatorForAll('[data-bar-row]')(),
      this.locatorForAll('[data-bar-row] [data-bar-label]')(),
      this.locatorForAll('[data-bar-row] [data-bar-amount]')(),
    ])
    return Promise.all(
      rows.map(async (row, index) => {
        const expanded = await row.getAttribute('data-expanded')
        return {
          label: (await labels[index]?.text()) ?? '',
          amount: (await amounts[index]?.text()) ?? '',
          depth: Number(await row.getAttribute('data-depth')),
          expanded: expanded === null ? null : expanded === 'true',
        }
      })
    )
  }

  /** Expands or collapses the group row with this label. */
  async toggle(label: string): Promise<void> {
    for (const toggle of await this.locatorForAll('button[data-bar-toggle]')()) {
      if ((await toggle.text()) === label) {
        await toggle.click()
        return
      }
    }
    throw new Error(`No expandable row labelled "${label}"`)
  }

  /** The accessible summary of the whole list. */
  async getSummary(): Promise<string | null> {
    return (await this.locatorFor('ul')()).getAttribute('aria-label')
  }
}
