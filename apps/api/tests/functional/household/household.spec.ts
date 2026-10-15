import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import Household from '#models/household'
import limiter from '@adonisjs/limiter/services/main'
import { categoryBySlug } from '#tests/helpers/ledger'
import { createHousehold } from '#tests/helpers/household'
import { FACTORY_PASSWORD } from '#database/factories/user_factory'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'

test.group('Household', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_suspended_household_reports_its_own_error_code', async ({ client }) => {
    const { owner, household } = await createHousehold()
    household.status = 'suspended'
    await household.save()

    const response = await client.get('/api/v1/accounts').actingAs(owner)

    response.assertStatus(403)
    response.assertBodyContains({ code: 'E_HOUSEHOLD_SUSPENDED' })
  })

  test('test_stale_session_version_is_rejected_on_household_routes', async ({ client }) => {
    const { owner } = await createHousehold()
    const staleVersion = owner.sessionVersion
    owner.sessionVersion += 1
    await owner.save()

    const response = await client
      .get('/api/v1/accounts')
      .loginAs(owner)
      .withSession({ sv: staleVersion })

    response.assertStatus(401)
  })

  test('test_household_delete_password_attempts_are_throttled_per_user', async ({
    client,
    assert,
  }) => {
    const { owner, household } = await createHousehold()

    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await client
        .post('/api/v1/household/delete')
        .json({ password: 'not-the-password' })
        .actingAs(owner)
      response.assertStatus(422)
    }

    const blocked = await client
      .post('/api/v1/household/delete')
      .json({ password: FACTORY_PASSWORD })
      .actingAs(owner)
    blocked.assertStatus(429)
    await household.refresh()
    assert.equal(household.status, 'active')
  })
  test('test_show_returns_the_current_household', async ({ client }) => {
    const { owner, household } = await createHousehold()

    const response = await client.get('/api/v1/household').actingAs(owner)

    response.assertStatus(200)
    response.assertBodyContains({
      data: { id: household.id, name: household.name, currencyCode: 'AUD', status: 'active' },
    })
  })

  test('test_owner_updates_name_locale_and_timezone', async ({ client, assert }) => {
    const { owner, household } = await createHousehold()

    const response = await client
      .patch('/api/v1/household')
      .json({ name: 'Renamed home', locale: 'es', timezone: 'Australia/Sydney' })
      .actingAs(owner)

    response.assertStatus(200)
    await household.refresh()
    assert.equal(household.name, 'Renamed home')
    assert.equal(household.locale, 'es')
    assert.equal(household.timezone, 'Australia/Sydney')
  })

  test('test_update_rejects_an_unknown_timezone', async ({ client }) => {
    const { owner } = await createHousehold()

    const response = await client
      .patch('/api/v1/household')
      .json({ timezone: 'Mars/Olympus_Mons' })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'timezone', rule: 'timezone' }] })
  })

  test('test_members_lists_everyone_with_their_role', async ({ client, assert }) => {
    const { owner, member } = await createHousehold({ users: 2 })

    const response = await client.get('/api/v1/household/members').actingAs(member)

    response.assertStatus(200)
    const rows = response.body().data
    assert.lengthOf(rows, 2)
    assert.sameDeepMembers(
      rows.map((row: any) => ({ userId: row.userId, role: row.role })),
      [
        { userId: owner.id, role: 'owner' },
        { userId: member.id, role: 'member' },
      ]
    )
  })

  test('test_member_cannot_invite_or_delete_household', async ({ client }) => {
    const { member } = await createHousehold({ users: 2 })

    const invite = await client
      .post('/api/v1/household/invitations')
      .json({ email: 'friend@example.test' })
      .actingAs(member)
    invite.assertStatus(403)

    const destroy = await client
      .post('/api/v1/household/delete')
      .json({ password: FACTORY_PASSWORD })
      .actingAs(member)
    destroy.assertStatus(403)

    for (const request of [
      client.patch('/api/v1/household').json({ name: 'Nope' }),
      client.get('/api/v1/household/invitations'),
      client.get('/api/v1/household/export'),
    ]) {
      const response = await request.actingAs(member)
      response.assertStatus(403)
    }
  })

  test('test_delete_schedules_deletion_and_blocks_access', async ({ client, assert }) => {
    const { owner, member, household } = await createHousehold({ users: 2 })

    const wrongPassword = await client
      .post('/api/v1/household/delete')
      .json({ password: 'not-the-password' })
      .actingAs(owner)
    wrongPassword.assertStatus(422)
    wrongPassword.assertBodyContains({ errors: [{ field: 'password', rule: 'matches' }] })

    const response = await client
      .post('/api/v1/household/delete')
      .json({ password: FACTORY_PASSWORD })
      .actingAs(owner)
    response.assertStatus(200)
    response.assertBodyContains({ data: { status: 'pending_deletion' } })

    await household.refresh()
    assert.equal(household.status, 'pending_deletion')
    assert.isTrue(household.deletionScheduledAt! > DateTime.now().plus({ days: 29 }))

    for (const user of [owner, member]) {
      const blocked = await client.get('/api/v1/accounts').actingAs(user)
      blocked.assertStatus(403)
      blocked.assertBodyContains({ code: 'E_HOUSEHOLD_PENDING_DELETION' })
    }

    // /auth/me keeps working so the SPA can offer the restore.
    const me = await client.get('/api/v1/auth/me').actingAs(owner)
    me.assertBodyContains({ data: { household: { status: 'pending_deletion' } } })
  })

  test('test_restore_within_window_reactivates', async ({ client, assert }) => {
    const { owner, household } = await createHousehold()
    household.status = 'pending_deletion'
    household.deletionScheduledAt = DateTime.now().plus({ days: 10 })
    await household.save()

    const response = await client.post('/api/v1/household/restore').actingAs(owner)

    response.assertStatus(200)
    await household.refresh()
    assert.equal(household.status, 'active')
    assert.isNull(household.deletionScheduledAt)
    const accounts = await client.get('/api/v1/accounts').actingAs(owner)
    accounts.assertStatus(200)
  })

  test('test_restore_after_the_window_is_gone', async ({ client }) => {
    const { owner, household } = await createHousehold()
    household.status = 'pending_deletion'
    household.deletionScheduledAt = DateTime.now().minus({ days: 1 })
    await household.save()

    const response = await client.post('/api/v1/household/restore').actingAs(owner)

    response.assertStatus(410)
  })

  test('test_restore_of_an_active_household_is_a_conflict', async ({ client }) => {
    const { owner } = await createHousehold()

    const response = await client.post('/api/v1/household/restore').actingAs(owner)

    response.assertStatus(409)
  })

  test('test_member_cannot_restore', async ({ client }) => {
    const { member, household } = await createHousehold({ users: 2 })
    household.status = 'pending_deletion'
    household.deletionScheduledAt = DateTime.now().plus({ days: 10 })
    await household.save()

    const response = await client.post('/api/v1/household/restore').actingAs(member)

    response.assertStatus(403)
    await Household.findOrFail(household.id)
  })

  test('test_export_contains_all_household_data', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      users: 2,
      taxonomy: true,
      accounts: [{ name: 'Everyday', externalAccountNumber: '000111222' }, { name: 'Savings' }],
    })
    const split = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -1_000,
      tags: ['weekly'],
    })
      .apply('split')
      .create()
    const transfer = await TransferFactory.merge({
      householdId: household.id,
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
    }).create()

    const response = await client.get('/api/v1/household/export').actingAs(owner)

    response.assertStatus(200)
    assert.include(response.header('content-disposition'), 'attachment')
    const body = response.body()
    assert.equal(body.household.id, household.id)
    assert.lengthOf(body.members, 2)
    assert.sameMembers(
      body.accounts.map((a: any) => a.name),
      ['Everyday', 'Savings']
    )
    assert.isAbove(body.categoryGroups.length, 5)
    assert.isAbove(body.categories.length, 20)
    assert.deepEqual(
      body.transfers.map((t: any) => t.id),
      [transfer.id]
    )
    // The split transaction and both transfer legs.
    assert.lengthOf(body.transactions, 3)
    const exported = body.transactions.find((t: any) => t.id === split.id)
    assert.include(exported, { amountCents: -1_000, isSplit: true })
    assert.deepEqual(exported.tags, ['weekly'])
    assert.lengthOf(exported.splits, 2)
    assert.notInclude(JSON.stringify(body), '"password"')
  })

  test('test_export_csv_escapes_formula_cells', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      taxonomy: true,
      accounts: [{ name: '=cmd|calc' }],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-10-02',
      amountCents: -1_234,
      categoryId: groceries.id,
      payee: '=HYPERLINK("http://evil.test","Click")',
      description: '@SUM(1,2)',
      tags: ['+tag', '-5'],
    }).create()

    const response = await client.get('/api/v1/household/export?format=csv').actingAs(owner)

    response.assertStatus(200)
    assert.include(response.header('content-type'), 'text/csv')
    assert.include(response.header('content-disposition'), '.csv')
    const lines = response
      .text()
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n')
    assert.lengthOf(lines, 2)
    assert.isTrue(lines[0].startsWith('Date,Bank date,Account,Type,Amount'))
    const row = lines[1]
    assert.include(row, `'=cmd|calc`)
    assert.include(row, `"'=HYPERLINK(""http://evil.test"",""Click"")"`)
    assert.include(row, `"'@SUM(1,2)"`)
    assert.include(row, `'+tag; -5`)
    // Amounts stay numbers; system categories are named in the reader's locale.
    assert.include(row, ',-12.34,AUD,Groceries,Food,')
    assert.notInclude(row, `'-12.34`)
  })

  test('test_export_masks_the_partners_private_transactions', async ({ client, assert }) => {
    const { owner, member, household, accounts } = await createHousehold({
      users: 2,
      accounts: [{ name: 'Joint' }],
    })
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -50_000,
      payee: 'Secret jeweller',
      paidByUserId: member.id,
      createdByUserId: member.id,
    })
      .apply('private')
      .create()

    const json = await client.get('/api/v1/household/export').actingAs(owner)
    const csv = await client.get('/api/v1/household/export?format=csv').actingAs(owner)

    assert.include(json.body().transactions[0], {
      amountCents: -50_000,
      payee: null,
      isPrivate: true,
    })
    assert.notInclude(json.text(), 'Secret jeweller')
    assert.notInclude(csv.text(), 'Secret jeweller')
    assert.include(csv.text(), ',-500.00,AUD,Private,')
  })
})
