import { test } from '@japa/runner'
import { createHousehold } from '#tests/helpers/household'

/**
 * Values Postgres cannot store must stop at validation (422), never reach
 * the database (500): years outside 1900-2999 and ids beyond int4.
 */
test.group('Ledger validation', () => {
  test('test_dates_and_months_outside_1900_to_2999_are_rejected', async ({ client }) => {
    const { owner, accounts } = await createHousehold({ accounts: [{}] })
    const entry = { accountId: accounts[0].id, kind: 'expense', amountCents: 100 }

    for (const date of ['0000-01-01', '1899-12-31', '3000-01-01']) {
      const response = await client
        .post('/api/v1/transactions')
        .json({ ...entry, date })
        .actingAs(owner)
      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ field: 'date', rule: 'dateString' }] })
    }

    for (const url of [
      '/api/v1/reports/month?month=0000-01',
      '/api/v1/reports/trend?month=3000-01',
      '/api/v1/transactions?month=1899-12',
      '/api/v1/transactions?from=0001-01-01',
    ]) {
      const response = await client.get(url).actingAs(owner)
      response.assertStatus(422)
    }

    const account = await client
      .post('/api/v1/accounts')
      .json({ name: 'Old', kind: 'cash', openingBalanceDate: '0000-01-01' })
      .actingAs(owner)
    account.assertStatus(422)

    // The edges are fine.
    for (const date of ['1900-01-01', '2999-12-31']) {
      const response = await client
        .post('/api/v1/transactions')
        .json({ ...entry, date })
        .actingAs(owner)
      response.assertStatus(201)
    }
  })

  test('test_ids_beyond_the_postgres_integer_range_are_rejected', async ({ client }) => {
    const { owner } = await createHousehold({ accounts: [{}] })
    const huge = 3_000_000_000

    for (const request of [
      client.get(`/api/v1/transactions/${huge}`),
      client.get(`/api/v1/transactions?accountId=${huge}`),
      client.get(`/api/v1/reports/category/${huge}`),
      client
        .post('/api/v1/transactions')
        .json({ accountId: huge, kind: 'expense', date: '2026-10-01', amountCents: 1 }),
    ]) {
      const response = await request.actingAs(owner)
      response.assertStatus(422)
    }
  })
})
