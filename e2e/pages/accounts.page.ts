import { expect, type Page } from '@playwright/test'

type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00'

/** `/settings/accounts`: the accounts with their balances and the account sheet. */
export class AccountsPage {
  constructor(private readonly page: Page) {}

  get add() {
    return this.page.getByTestId('accounts.add')
  }
  /** The account sheet while it is open. */
  get sheet() {
    return this.page.locator('app-account-sheet')
  }

  /** The card of the account named `name`. */
  card(name: string) {
    return this.page.getByTestId('accounts.page').locator('app-card').filter({ hasText: name })
  }

  balance(name: string) {
    return this.card(name).getByTestId('accounts.balance')
  }

  async goto(): Promise<void> {
    await this.page.goto('/settings/accounts')
    await expect(this.add).toBeVisible()
  }

  async edit(name: string): Promise<void> {
    await this.card(name).getByRole('button').first().click()
    await expect(this.sheet.getByTestId('accountSheet.save')).toBeVisible()
  }

  /** Types the opening balance on the keypad; `owes` ticks "Owes money" when it is not yet. */
  async setOpeningBalance(
    keys: KeypadKey[],
    options: { owes?: boolean; date?: string } = {}
  ): Promise<void> {
    await this.sheet.getByTestId('accountSheet.openingBalance').click()
    const keypad = this.sheet.getByTestId('accountSheet.keypad')
    for (const key of keys) {
      await keypad.locator(`button[data-key="${key}"]`).click()
    }
    if (options.owes !== undefined) {
      await this.sheet.getByTestId('accountSheet.owes').locator('input').setChecked(options.owes)
    }
    if (options.date !== undefined) {
      await this.sheet.getByTestId('accountSheet.openingDate').fill(options.date)
    }
  }

  /** Saves and waits for the sheet to close; resolves with the API's status. */
  async save(): Promise<number> {
    const saved = this.page.waitForResponse(
      (response) =>
        /\/api\/v1\/accounts(\/\d+)?$/.test(response.url()) &&
        ['POST', 'PATCH'].includes(response.request().method())
    )
    await this.sheet.getByTestId('accountSheet.save').click()
    const status = (await saved).status()
    await expect(this.sheet).toHaveCount(0)
    return status
  }
}
