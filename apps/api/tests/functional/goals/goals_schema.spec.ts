import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { createHousehold } from '#tests/helpers/household'

/** Runs `work` in a savepoint so an expected failure does not poison the test transaction. */
async function rejects(work: (trx: any) => Promise<unknown>) {
  try {
    await db.transaction(async (trx) => {
      await work(trx)
    })
    return false
  } catch {
    return true
  }
}

function goalRow(householdId: number, overrides: Record<string, unknown> = {}) {
  return {
    household_id: householdId,
    name: 'Emergency fund',
    target_cents: 100_000,
    sort_order: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

function insightRow(householdId: number, overrides: Record<string, unknown> = {}) {
  return {
    household_id: householdId,
    month: '2026-09',
    locale: 'en',
    headline: 'A calm month',
    body_markdown: 'Nothing unusual.',
    input_json: JSON.stringify({ month: '2026-09' }),
    model: 'fake',
    generated_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

test.group('Goals and insights schema', () => {
  test('test_goal_defaults_to_an_active_household_goal_starting_at_zero', async ({ assert }) => {
    const { household } = await createHousehold()

    const [row] = await db.table('savings_goals').insert(goalRow(household.id)).returning('*')

    assert.include(row, {
      status: 'active',
      starting_cents: 0,
      monthly_contribution_cents: null,
      account_id: null,
      user_id: null,
      target_date: null,
      reached_at: null,
    })
  })

  test('test_goal_amount_checks_reject_non_positive_target_and_negative_contribution', async ({
    assert,
  }) => {
    const { household } = await createHousehold()

    for (const overrides of [
      { target_cents: 0 },
      { target_cents: -1 },
      { monthly_contribution_cents: -1 },
      { status: 'paused' },
    ]) {
      assert.isTrue(
        await rejects((trx) => trx.table('savings_goals').insert(goalRow(household.id, overrides))),
        JSON.stringify(overrides)
      )
    }
    assert.isFalse(
      await rejects((trx) =>
        trx.table('savings_goals').insert(goalRow(household.id, { monthly_contribution_cents: 0 }))
      )
    )
  })

  test('test_account_used_by_a_goal_cannot_be_deleted_but_the_household_cascades', async ({
    assert,
  }) => {
    const { household, accounts } = await createHousehold({ accounts: [{ name: 'Savings' }] })
    await db.table('savings_goals').insert(goalRow(household.id, { account_id: accounts[0].id }))

    assert.isTrue(await rejects((trx) => trx.from('accounts').where('id', accounts[0].id).delete()))

    await db.from('households').where('id', household.id).delete()
    assert.lengthOf(await db.from('savings_goals').where('household_id', household.id), 0)
    assert.lengthOf(await db.from('accounts').where('household_id', household.id), 0)
  })

  test('test_monthly_insight_is_unique_per_household_month_and_locale', async ({ assert }) => {
    const { household } = await createHousehold()
    const other = await createHousehold()

    const [row] = await db.table('monthly_insights').insert(insightRow(household.id)).returning('*')
    assert.deepEqual(row.highlights, [])

    assert.isTrue(
      await rejects((trx) => trx.table('monthly_insights').insert(insightRow(household.id)))
    )
    // Another locale, another month or another household are separate rows.
    assert.isFalse(
      await rejects((trx) =>
        trx
          .table('monthly_insights')
          .insert([
            insightRow(household.id, { locale: 'es' }),
            insightRow(household.id, { month: '2026-08' }),
            insightRow(other.household.id),
          ])
      )
    )
  })
})
