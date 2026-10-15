import { ComponentHarness } from '@angular/cdk/testing'

export class TabBarHarness extends ComponentHarness {
  static hostSelector = 'app-tab-bar'

  private readonly tabs = this.locatorForAll('a:not([data-testid="shell.add"])')
  private readonly add = this.locatorFor('a[data-testid="shell.add"]')

  async getTabLabels(): Promise<string[]> {
    return Promise.all((await this.tabs()).map(async (tab) => (await tab.text()).trim()))
  }

  async getActiveTab(): Promise<string | null> {
    const active = await this.locatorForOptional('a[aria-current="page"]')()
    return active ? (await active.text()).trim() : null
  }

  async getAddLabel(): Promise<string | null> {
    return (await this.add()).getAttribute('aria-label')
  }

  async getNavLabel(): Promise<string | null> {
    return (await this.locatorFor('nav')()).getAttribute('aria-label')
  }

  async clickTab(label: string): Promise<void> {
    for (const tab of await this.tabs()) {
      if ((await tab.text()).trim() === label) {
        await tab.click()
        return
      }
    }
    throw new Error(`No tab labelled "${label}"`)
  }

  async clickAdd(): Promise<void> {
    await (await this.add()).click()
  }
}
