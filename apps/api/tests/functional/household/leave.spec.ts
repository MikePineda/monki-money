import { test } from '@japa/runner'
import AccountCard from '#models/account_card'
import Transaction from '#models/transaction'
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
      message:
        'Owners cannot leave their household. Make another member the owner first, or delete it',
    })
    spanish.assertStatus(422)
    assert.equal(
      spanish.body().message,
      'Quien administra el hogar no puede salir de él. Pasa la administración a otra persona o bórralo'
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
    await AccountCard.create({
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
    for (const row of [paid, gift]) await row.refresh()
    // History is history: who paid and who entered each row stays.
    assert.equal(paid.paidByUserId, member.id)
    assert.equal(paid.createdByUserId, member.id)
    assert.equal(gift.paidByUserId, member.id)

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

  test('test_leaving_makes_the_members_personal_accounts_joint_and_unlinks_their_cards', async ({
    client,
    assert,
  }) => {
    const { owner, member, accounts } = await createHousehold({
      users: 2,
      accounts: [
        { name: 'Joint everyday' },
        { name: 'Member wallet', owner: 1 },
        { name: 'Owner wallet', owner: 0 },
      ],
    })
    const [joint, memberWallet, ownerWallet] = accounts
    const memberCardOnJoint = await AccountCard.create({
      accountId: joint.id,
      cardSuffix: '1111',
      userId: member.id,
    })
    const ownerCardOnJoint = await AccountCard.create({
      accountId: joint.id,
      cardSuffix: '2222',
      userId: owner.id,
    })
    const memberCardOnWallet = await AccountCard.create({
      accountId: memberWallet.id,
      cardSuffix: '3333',
      userId: member.id,
    })

    const response = await client.post('/api/v1/household/leave').actingAs(member)

    response.assertStatus(204)
    for (const row of [memberWallet, ownerWallet, joint]) await row.refresh()
    for (const row of [memberCardOnJoint, ownerCardOnJoint, memberCardOnWallet]) await row.refresh()
    // The leaver's personal account stays with the household as a joint one.
    assert.isNull(memberWallet.ownerUserId)
    assert.isTrue(memberWallet.isActive)
    assert.isNull(memberCardOnJoint.userId)
    assert.isNull(memberCardOnWallet.userId)
    // Nobody else's accounts or cards change.
    assert.equal(ownerWallet.ownerUserId, owner.id)
    assert.isNull(joint.ownerUserId)
    assert.equal(ownerCardOnJoint.userId, owner.id)

    const listed = await client.get('/api/v1/accounts').actingAs(owner)
    listed.assertStatus(200)
    assert.deepInclude(
      listed.body().data.find((row: { id: number }) => row.id === memberWallet.id),
      { ownerUserId: null }
    )
  })

  test('test_new_rows_on_a_former_members_account_default_to_whoever_enters_them', async ({
    client,
    assert,
  }) => {
    const { owner, member, accounts } = await createHousehold({
      users: 2,
      accounts: [{ name: 'Joint everyday' }, { name: 'Member wallet', owner: 1 }],
    })
    const [joint, memberWallet] = accounts
    await AccountCard.create({ accountId: joint.id, cardSuffix: '1111', userId: member.id })
    await AccountCard.create({ accountId: memberWallet.id, cardSuffix: '3333', userId: member.id })
    const body = { kind: 'expense', date: '2026-10-03', amountCents: 500 }

    const leave = await client.post('/api/v1/household/leave').actingAs(member)
    leave.assertStatus(204)

    // Their former personal account: no longer theirs, so whoever enters the row.
    const onWallet = await client
      .post('/api/v1/transactions')
      .json({ ...body, accountId: memberWallet.id })
      .actingAs(owner)
    onWallet.assertStatus(201)
    onWallet.assertBodyContains({ data: { paidByUserId: owner.id } })

    // Their card on the joint account no longer names a payer.
    const withTheirCard = await client
      .post('/api/v1/transactions')
      .json({ ...body, accountId: joint.id, cardSuffix: '1111' })
      .actingAs(owner)
    withTheirCard.assertStatus(201)
    withTheirCard.assertBodyContains({ data: { paidByUserId: owner.id } })

    // Transfer legs on that account follow the same rule.
    const transfer = await client
      .post('/api/v1/transfers')
      .json({
        fromAccountId: memberWallet.id,
        toAccountId: joint.id,
        date: '2026-10-04',
        amountCents: 1_000,
      })
      .actingAs(owner)
    transfer.assertStatus(201)
    const legs = await Transaction.query().where('transfer_id', transfer.body().data.id)
    assert.deepEqual(
      legs.map((leg) => leg.paidByUserId),
      [owner.id, owner.id]
    )
  })
})
