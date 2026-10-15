import { test } from '@japa/runner'
import AccountCard from '#models/account_card'
import HouseholdMember from '#models/household_member'
import limiter from '@adonisjs/limiter/services/main'
import { createHousehold } from '#tests/helpers/household'
import { TransactionFactory } from '#database/factories/transaction_factory'

test.group('Household / leave', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_member_can_leave_household_and_loses_access', async ({ client, assert }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const sessionVersion = member.sessionVersion

    const response = await client.post('/api/v1/household/leave').actingAs(member)

    response.assertStatus(204)
    assert.isNull(
      await HouseholdMember.query()
        .where('household_id', household.id)
        .where('user_id', member.id)
        .first()
    )
    await member.refresh()
    assert.isNull(member.currentHouseholdId)
    // The session survives: the next household request answers "no household"
    // (the SPA routes that to onboarding).
    assert.equal(member.sessionVersion, sessionVersion)
    const afterwards = await client.get('/api/v1/household').actingAs(member)
    afterwards.assertStatus(403)
    afterwards.assertBodyContains({ code: 'E_NO_HOUSEHOLD' })
    const me = await client.get('/api/v1/auth/me').actingAs(member)
    me.assertStatus(200)
    me.assertBodyContains({ data: { household: null, membership: null } })

    const members = await client.get('/api/v1/household/members').actingAs(owner)
    assert.deepEqual(
      members.body().data.map((row: { userId: number }) => row.userId),
      [owner.id]
    )
  })

  test('test_owner_cannot_leave_household', async ({ client, assert }) => {
    const { household, owner } = await createHousehold({ users: 2 })
    const spanishHome = await createHousehold({ locale: 'es' })

    const english = await client.post('/api/v1/household/leave').actingAs(owner)
    const spanish = await client.post('/api/v1/household/leave').actingAs(spanishHome.owner)

    english.assertStatus(422)
    english.assertBody({
      code: 'E_OWNER_CANNOT_LEAVE',
      message: 'Owners cannot leave their household. Delete it instead',
    })
    spanish.assertStatus(422)
    assert.equal(
      spanish.body().message,
      'Quien administra el hogar no puede salir de él. Bórralo en su lugar'
    )
    await owner.refresh()
    assert.equal(owner.currentHouseholdId, household.id)
  })

  test('test_leaving_keeps_the_members_transactions', async ({ client, assert }) => {
    const { household, owner, member, accounts } = await createHousehold({
      users: 2,
      accounts: [{ name: 'Member everyday', owner: 1 }],
    })
    const account = accounts[0]
    const card = await AccountCard.create({
      accountId: account.id,
      cardSuffix: '4321',
      userId: member.id,
      label: null,
    })
    const paid = await TransactionFactory.merge({
      householdId: household.id,
      accountId: account.id,
      amountCents: -2_500,
      payee: 'Bakery',
      paidByUserId: member.id,
      createdByUserId: member.id,
    }).create()
    const gift = await TransactionFactory.merge({
      householdId: household.id,
      accountId: account.id,
      amountCents: -9_900,
      payee: 'Surprise gift',
      paidByUserId: member.id,
      createdByUserId: member.id,
    })
      .apply('private')
      .create()

    const response = await client.post('/api/v1/household/leave').actingAs(member)

    response.assertStatus(204)
    for (const row of [paid, gift, account, card]) await row.refresh()
    assert.equal(paid.paidByUserId, member.id)
    assert.equal(paid.createdByUserId, member.id)
    assert.equal(account.ownerUserId, member.id)
    assert.equal(card.userId, member.id)

    // The household keeps the rows; the leaver's private row becomes ordinary.
    const ledger = await client.get('/api/v1/transactions').actingAs(owner)
    ledger.assertStatus(200)
    const rows = ledger.body().data as Array<{ id: number; payee: string; isMasked: boolean }>
    assert.sameMembers(
      rows.map((row) => row.id),
      [paid.id, gift.id]
    )
    assert.deepInclude(
      rows.find((row) => row.id === gift.id),
      {
        payee: 'Surprise gift',
        isMasked: false,
      }
    )
  })
})
