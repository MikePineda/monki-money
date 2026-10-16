import { AccountsPage } from '../pages/accounts.page.ts'
import { expect, signUpOwner, test } from '../support/fixtures.ts'

test.describe('journey: account balances', () => {
  test('an opening balance moves the account balance, also into debt', async ({
    page,
    context,
  }) => {
    // signUpOwner adds an empty "Cash" account so the app skips onboarding.
    await signUpOwner(context)
    const accounts = new AccountsPage(page)
    await accounts.goto()
    await expect(accounts.balance('Cash')).toContainText('$0.00')

    await accounts.edit('Cash')
    await accounts.setOpeningBalance(['1', '2', '3', '4', '5'], { date: '2026-01-31' })
    expect(await accounts.save()).toBe(200)
    await expect(accounts.balance('Cash')).toContainText('$123.45')

    await accounts.edit('Cash')
    await accounts.setOpeningBalance([], { owes: true })
    expect(await accounts.save()).toBe(200)
    await expect(accounts.balance('Cash')).toContainText('−$123.45')

    await page.reload()
    await expect(accounts.balance('Cash')).toContainText('−$123.45')
  })
})
