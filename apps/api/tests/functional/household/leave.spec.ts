import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import AccountCard from '#models/account_card'
import MerchantRule from '#models/merchant_rule'
import RecurringItem from '#models/recurring_item'
import { categoryBySlug } from '#tests/helpers/ledger'
import Transaction from '#models/transaction'
import type Household from '#models/household'
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

  test('test_leaving_frees_the_members_merchant_rules_and_they_stay_editable', async ({
    client,
    assert,
  }) => {
    const { household, owner, member } = await createHousehold({ users: 2, taxonomy: true })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const theirs = await MerchantRule.create({
      householdId: household.id,
      matchType: 'contains',
      pattern: 'BAKERY',
      categoryId: groceries.id,
      paidByUserId: member.id,
      origin: 'user',
    })
    const ours = await MerchantRule.create({
      householdId: household.id,
      matchType: 'contains',
      pattern: 'BUTCHER',
      categoryId: groceries.id,
      paidByUserId: owner.id,
      origin: 'user',
    })

    const leave = await client.post('/api/v1/household/leave').actingAs(member)
    leave.assertStatus(204)

    for (const rule of [theirs, ours]) await rule.refresh()
    assert.isNull(theirs.paidByUserId)
    assert.equal(ours.paidByUserId, owner.id)
    // Editing it no longer trips over a payer who is gone.
    const edit = await client
      .patch(`/api/v1/rules/${theirs.id}`)
      .json({ pattern: 'CORNER BAKERY' })
      .actingAs(owner)
    edit.assertStatus(200)
    edit.assertBodyContains({ data: { pattern: 'CORNER BAKERY', paidByUserId: null } })
  })

  test('test_leaving_frees_the_members_recurring_items', async ({ client, assert }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const base = {
      householdId: household.id,
      cadence: 'monthly' as const,
      amountCents: 4_500,
      nextExpectedDate: '2026-11-01',
    }
    const theirs = await RecurringItem.create({
      ...base,
      merchantKey: 'PHONE',
      payee: 'Phone',
      paidByUserId: member.id,
    })
    const ours = await RecurringItem.create({
      ...base,
      merchantKey: 'GYM',
      payee: 'Gym',
      paidByUserId: owner.id,
    })

    const leave = await client.post('/api/v1/household/leave').actingAs(member)
    leave.assertStatus(204)

    for (const item of [theirs, ours]) await item.refresh()
    assert.isNull(theirs.paidByUserId)
    assert.equal(ours.paidByUserId, owner.id)
    const edit = await client
      .patch(`/api/v1/recurring/${theirs.id}`)
      .json({ amountCents: 5_000 })
      .actingAs(owner)
    edit.assertStatus(200)
  })

  test('test_leaving_frees_the_members_open_import_rows_but_not_confirmed_ones', async ({
    client,
    assert,
  }) => {
    const { household, member, accounts } = await createHousehold({
      users: 2,
      taxonomy: true,
      accounts: [{ name: 'Everyday' }],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const batch = await ImportBatch.create({
      householdId: household.id,
      accountId: accounts[0].id,
      source: 'nab_csv',
      status: 'staged',
      fileHash: 'd'.repeat(64),
    })
    const row = (rowIndex: number, extra: Partial<ImportRow>) =>
      ImportRow.create({
        importBatchId: batch.id,
        householdId: household.id,
        accountId: accounts[0].id,
        rowIndex,
        externalHash: `${rowIndex}`.repeat(64),
        raw: {},
        bankDate: '2026-10-01',
        date: '2026-10-01',
        amountCents: -1_000,
        descriptionRaw: 'BAKERY',
        descriptionNormalized: 'BAKERY',
        resolution: 'new',
        reasons: [],
        suggestedPaidByUserId: member.id,
        ...extra,
      })
    const suggested = await row(0, {})
    const decided = await row(1, {
      decision: { paidByUserId: member.id, categoryId: groceries.id },
      decidedAt: DateTime.now(),
    })
    const confirmed = await row(2, { confirmedAt: DateTime.now() })

    const leave = await client.post('/api/v1/household/leave').actingAs(member)
    leave.assertStatus(204)

    for (const item of [suggested, decided, confirmed]) await item.refresh()
    // Rows still to confirm no longer name them as the payer...
    assert.isNull(suggested.suggestedPaidByUserId)
    assert.isNull(decided.suggestedPaidByUserId)
    assert.deepEqual(decided.decision, { categoryId: groceries.id })
    // ...while a confirmed row is history.
    assert.equal(confirmed.suggestedPaidByUserId, member.id)
  })

  test('test_a_member_can_leave_while_the_household_is_pending_deletion', async ({
    client,
    assert,
  }) => {
    const { household, member, accounts } = await createHousehold({
      users: 2,
      accounts: [{ name: 'Joint everyday' }, { name: 'Member wallet', owner: 1 }],
    })
    const [, memberWallet] = accounts
    await scheduleDeletion(household)

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
    // The leaving rule still applies: the personal account stays, joint.
    await memberWallet.refresh()
    assert.isNull(memberWallet.ownerUserId)
    // The owner's deletion is untouched.
    await household.refresh()
    assert.equal(household.status, 'pending_deletion')
  })

  test('test_the_owner_still_cannot_leave_while_the_household_is_pending_deletion', async ({
    client,
    assert,
  }) => {
    const { household, owner } = await createHousehold({ users: 2 })
    await scheduleDeletion(household)

    const response = await client.post('/api/v1/household/leave').actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ code: 'E_OWNER_CANNOT_LEAVE' })
    await owner.refresh()
    assert.equal(owner.currentHouseholdId, household.id)
  })

  test('test_a_member_cannot_leave_a_suspended_household', async ({ client, assert }) => {
    const { household, member } = await createHousehold({ users: 2 })
    household.status = 'suspended'
    await household.save()

    const response = await client.post('/api/v1/household/leave').actingAs(member)

    response.assertStatus(403)
    response.assertBodyContains({ code: 'E_HOUSEHOLD_SUSPENDED' })
    await member.refresh()
    assert.equal(member.currentHouseholdId, household.id)
  })
})

/** The owner asked to delete the household: inside the 30-day window. */
async function scheduleDeletion(household: Household) {
  household.merge({
    status: 'pending_deletion',
    deletionScheduledAt: DateTime.now().plus({ days: 30 }),
  })
  await household.save()
}
