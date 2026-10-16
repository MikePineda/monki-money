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
  /** The warning an explicit logout shows while entries are still queued. */
  get logoutWarning() {
    return this.page.getByTestId('outbox.logout')
  }
  get logoutAnyway() {
    return this.page.getByTestId('outbox.logout.confirm')
  }
  get logoutCancel() {
    return this.page.getByTestId('outbox.logout.cancel')
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
