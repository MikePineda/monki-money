import { test } from '@japa/runner'
import { balanceChainBreaks, openingBalanceCents } from '#domain/importing/balance_chain'
import { stageRows } from '#domain/importing/staging'
import { parseBankCsv } from '#importers/registry'
import { nabFixture } from '#tests/helpers/importing'

const TODAY = '2026-10-15'

function stagedSample() {
  return stageRows(parseBankCsv(nabFixture('sample.csv')).rows, { accountId: 1, today: TODAY })
}

test.group('Importing / synthetic NAB fixture', () => {
  test('test_sample_fixture_parses_every_row_and_hashes_are_unique', ({ assert }) => {
    const rows = stagedSample()
    assert.lengthOf(rows, 35)
    assert.equal(new Set(rows.map((row) => row.externalHash)).size, rows.length)
    assert.deepEqual(
      stagedSample().map((row) => row.externalHash),
      rows.map((row) => row.externalHash)
    )
    assert.deepEqual(
      rows.map((row) => row.rowIndex),
      rows.map((_, index) => index)
    )
  })

  test('test_sample_fixture_covers_the_real_export_shapes', ({ assert }) => {
    const rows = stagedSample()
    const zeroTwins = rows.filter((row) => row.amountCents === 0)
    assert.deepEqual(
      zeroTwins.map((row) => row.occurrence),
      [1, 2]
    )
    assert.equal(zeroTwins[0].balanceCents, zeroTwins[1].balanceCents)

    assert.lengthOf(
      rows.filter((row) => row.isPending),
      5
    )
    assert.sameMembers([...new Set(rows.map((row) => row.cardSuffix))], ['1111', '2222', null])
    assert.isTrue(rows.some((row) => row.amountCents === -70))
    assert.isTrue(rows.some((row) => row.amountCents === 64))
    assert.isTrue(rows.some((row) => row.details.includes('Us & Friends')))
    assert.isTrue(rows.some((row) => row.details.includes('Linked Acc Trns')))
    assert.isTrue(rows.some((row) => row.details.startsWith('Hnry - INV-')))
    assert.isTrue(rows.some((row) => row.details.includes('PAYROLL')))
    assert.isTrue(rows.some((row) => row.details === 'CASH'))
    assert.isTrue(rows.some((row) => row.details.startsWith('REFUND-EFTPOS')))
    assert.isTrue(rows.some((row) => row.nabMerchant === 'DEFT Payments'))

    const yearBoundary = rows.find((row) => row.details.startsWith('V1111 30/12'))
    assert.equal(yearBoundary?.bankDate, '2026-01-02')
    assert.equal(yearBoundary?.date, '2025-12-30')
    assert.isFalse(rows.some((row) => row.isFutureDated))
  })

  test('test_sample_fixture_balance_chain_is_consistent', ({ assert }) => {
    const rows = stagedSample()
    assert.deepEqual(balanceChainBreaks(rows), [])
    assert.equal(openingBalanceCents(rows), 138000)
  })
})
