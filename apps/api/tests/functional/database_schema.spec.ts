import { test } from '@japa/runner'
import Account from '#models/account'
import db from '@adonisjs/lucid/services/db'
import { POSTGRES_ENUMS } from '@monkimoney/shared'
import { createHousehold } from '#tests/helpers/household'
import { HouseholdFactory } from '#database/factories/household_factory'

test.group('Database schema', () => {
  test('test_date_columns_round_trip_without_timezone_shift', async ({ assert, cleanup }) => {
    // UTC+14: the default pg parser would turn 2026-03-01 into a Date at
    // local midnight, i.e. 2026-02-28T10:00Z once serialized.
    const originalTz = process.env.TZ
    process.env.TZ = 'Pacific/Kiritimati'
    cleanup(() => {
      process.env.TZ = originalTz
    })

    const { accounts } = await createHousehold({
      accounts: [{ name: 'Everyday', openingBalanceDate: '2026-03-01' }],
    })

    const fresh = await Account.findOrFail(accounts[0].id)
    assert.strictEqual(fresh.openingBalanceDate, '2026-03-01')

    const raw = await db.from('accounts').where('id', accounts[0].id).first()
    assert.strictEqual(raw.opening_balance_date, '2026-03-01')
    assert.equal(JSON.parse(JSON.stringify(fresh.serialize())).openingBalanceDate, '2026-03-01')
  })

  test('test_bigint_aggregates_are_numbers_not_strings', async ({ assert }) => {
    const { household } = await createHousehold({
      accounts: [{ openingBalanceCents: 1050 }, { openingBalanceCents: -50 }],
    })

    const row = await db
      .from('accounts')
      .where('household_id', household.id)
      .sum('opening_balance_cents as total')
      .count('* as count')
      .first()

    assert.strictEqual(row.total, 1000)
    assert.strictEqual(row.count, 2)
  })

  test('test_native_enums_match_shared_enums', async ({ assert }) => {
    const result = await db.rawQuery(`
      SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      GROUP BY t.typname
    `)
    const actual = Object.fromEntries(
      result.rows.map((row: { name: string; labels: string[] | string }) => [
        row.name,
        Array.isArray(row.labels) ? row.labels : row.labels.replace(/[{}]/g, '').split(','),
      ])
    )

    assert.deepEqual(
      actual,
      Object.fromEntries(
        Object.entries(POSTGRES_ENUMS).map(([name, values]) => [name, [...values]])
      )
    )
  })

  test('test_external_account_number_is_unique_per_household_only', async ({ assert }) => {
    const first = await createHousehold({ accounts: [{ externalAccountNumber: '000111222' }] })
    // Another household may use the same bank account number.
    const second = await createHousehold({ accounts: [{ externalAccountNumber: '000111222' }] })
    assert.notEqual(first.household.id, second.household.id)

    // Several accounts without a number are fine in the same household.
    await createHousehold({
      accounts: [{ externalAccountNumber: null }, { externalAccountNumber: null }],
    })

    await assert.rejects(() =>
      db.transaction(async (trx) => {
        await trx.table('accounts').insert({
          household_id: first.household.id,
          name: 'Duplicate',
          kind: 'transaction',
          external_account_number: '000111222',
          created_at: new Date(),
          updated_at: new Date(),
        })
      })
    )
  })

  test('test_household_factory_builds_members_with_users', async ({ assert }) => {
    const household = await HouseholdFactory.with('members', 2, (member) =>
      member.with('user')
    ).create()

    await household.load('members', (members) => members.preload('user'))
    assert.lengthOf(household.members, 2)
    assert.isTrue(household.members.every((member) => member.user.email.endsWith('@example.test')))
  })
})
