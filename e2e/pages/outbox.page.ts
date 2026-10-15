import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The offline outbox in the shell: the sync pill above the tab bar and the
 * sheet it opens (queued entries with retry, edit and discard).
 */
export class OutboxPage {
  constructor(private readonly page: Page) {}

  get pill() {
    return this.page.getByTestId('outbox.pill')
  }
  get sheet() {
    return this.page.getByTestId('outbox.sheet')
  }
  get entries() {
    return this.page.getByTestId('outbox.entry')
  }

  status(entry: Locator) {
    return entry.getByTestId('outbox.entry.status')
  }

  async open(): Promise<void> {
    await this.pill.click()
    await expect(this.sheet).toBeVisible()
  }

  /** "Discard", then the confirmation. */
  async discard(entry: Locator): Promise<void> {
    await entry.getByTestId('outbox.entry.discard').click()
    await entry.getByTestId('outbox.entry.confirmDiscard').click()
  }
}
