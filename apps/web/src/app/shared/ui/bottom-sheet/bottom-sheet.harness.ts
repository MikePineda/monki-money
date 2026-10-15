import { ComponentHarness } from '@angular/cdk/testing'

/** Locate with `TestbedHarnessEnvironment.documentRootLoader(fixture)`: sheets live in the overlay. */
export class BottomSheetHarness extends ComponentHarness {
  static hostSelector = 'app-bottom-sheet'

  async getTitle(): Promise<string> {
    return (await this.locatorFor('h2')()).text()
  }

  async close(): Promise<void> {
    await (await this.locatorFor('header button')()).click()
  }

  async getDialogAttribute(name: string): Promise<string | null> {
    const dialog = await this.documentRootLocatorFactory().locatorFor('[role="dialog"]')()
    return dialog.getAttribute(name)
  }
}
