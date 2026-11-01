import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import type Account from '#models/account'
import { createHousehold } from '#tests/helpers/household'
import LinkedHolderAccount from '#models/linked_holder_account'

const URL = '/api/v1/household/linked-holders'

/** A confirmed (holder, account) pair, straight in the table (synthetic holders). */
function linkHolder(
  account: Account,
  holderKey: string,
  confirmedCount: number,
  lastConfirmedAt: string
) {
  return LinkedHolderAccount.create({
    householdId: account.householdId,
    holderKey,
    accountId: account.id,
    confirmedCount,
    lastConfirmedAt: DateTime.fromISO(lastConfirmedAt),
  })
}

test.group('Household / linked holders', () => {
  test('test_linked_holders_list_each_holder_with_the_accounts_its_transfers_went_to', async ({
    client,
    assert,
  }) => {
    const { member, accounts } = await createHousehold({
      users: 2,
      accounts: [{ name: 'Everyday' }, { name: 'Savings', kind: 'savings' }, { name: 'Bills' }],
    })
    const [everyday, savings, bills] = accounts
    const toSavings = await linkHolder(
      savings,
      'linked acc trns morrow aj',
      5,
      '2026-10-10T09:00:00Z'
    )
    const toBills = await linkHolder(bills, 'linked acc trns morrow aj', 2, '2026-10-20T09:00:00Z')
    const other = await linkHolder(everyday, 'linked acc trns quill bt', 1, '2026-09-01T09:00:00Z')
    // Another household's holders never show.
    const elsewhere = await createHousehold({ accounts: [{ name: 'Elsewhere' }] })
    await linkHolder(elsewhere.accounts[0], 'linked acc trns morrow aj', 9, '2026-10-25T09:00:00Z')

    const response = await client.get(URL).actingAs(member)

    response.assertStatus(200)
    assert.deepEqual(response.body().data, [
      {
        holderKey: 'linked acc trns morrow aj',
        holderName: 'morrow aj',
        confirmedCount: 7,
        lastConfirmedAt: '2026-10-20T09:00:00.000Z',
        accounts: [
          {
            id: toSavings.id,
            accountId: savings.id,
            confirmedCount: 5,
            lastConfirmedAt: '2026-10-10T09:00:00.000Z',
          },
          {
            id: toBills.id,
            accountId: bills.id,
            confirmedCount: 2,
            lastConfirmedAt: '2026-10-20T09:00:00.000Z',
          },
        ],
      },
      {
        holderKey: 'linked acc trns quill bt',
        holderName: 'quill bt',
        confirmedCount: 1,
        lastConfirmedAt: '2026-09-01T09:00:00.000Z',
        accounts: [
          {
            id: other.id,
            accountId: everyday.id,
            confirmedCount: 1,
            lastConfirmedAt: '2026-09-01T09:00:00.000Z',
          },
        ],
      },
    ])
  })

  test('test_a_household_without_confirmed_transfers_has_no_linked_holders', async ({ client }) => {
    const { owner } = await createHousehold()

    const response = await client.get(URL).actingAs(owner)

    response.assertStatus(200)
    response.assertBody({ data: [] })
  })

  test('test_forgetting_a_pair_removes_only_that_account_of_the_holder', async ({
    client,
    assert,
  }) => {
    const { member, accounts } = await createHousehold({
      users: 2,
      accounts: [{ name: 'Savings', kind: 'savings' }, { name: 'Bills' }],
    })
    const [savings, bills] = accounts
    const wrong = await linkHolder(savings, 'linked acc trns morrow aj', 1, '2026-10-01T09:00:00Z')
    const right = await linkHolder(bills, 'linked acc trns morrow aj', 4, '2026-10-02T09:00:00Z')

    const response = await client.delete(`${URL}/${wrong.id}`).actingAs(member)

    response.assertStatus(204)
    assert.isNull(await LinkedHolderAccount.find(wrong.id))
    assert.isNotNull(await LinkedHolderAccount.find(right.id))
    const again = await client.delete(`${URL}/${wrong.id}`).actingAs(member)
    again.assertStatus(404)
  })

  test('test_forgetting_another_households_pair_answers_404_and_keeps_it', async ({
    client,
    assert,
  }) => {
    const victim = await createHousehold({ accounts: [{ name: 'Savings', kind: 'savings' }] })
    const pair = await linkHolder(
      victim.accounts[0],
      'linked acc trns morrow aj',
      3,
      '2026-10-01T09:00:00Z'
    )
    const attacker = await createHousehold()

    const response = await client.delete(`${URL}/${pair.id}`).actingAs(attacker.owner)

    response.assertStatus(404)
    assert.isNotNull(await LinkedHolderAccount.find(pair.id))
  })

  test('test_linked_holders_need_a_signed_in_person', async ({ client }) => {
    const response = await client.get(URL)

    response.assertStatus(401)
  })
})
