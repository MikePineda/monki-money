import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import { assignOccurrences, rowHash } from '#domain/importing/hash'
import { parsedRow } from '#tests/helpers/importing'

const base = {
  accountNumber: '123456789',
  bankDate: '2026-08-18',
  amountCents: -3000,
  detailsRaw: 'V1111 15/08 PHONECO MOBILE NORTH SYDN 70000000401',
  balanceCents: 817252,
  occurrence: 1,
}

test.group('Importing / row hash', () => {
  test('test_row_hash_is_stable_and_distinguishes_identical_rows_by_balance_and_occurrence', ({
    assert,
  }) => {
    assert.equal(rowHash(base), rowHash({ ...base }))
    assert.match(rowHash(base), /^[0-9a-f]{64}$/)

    // Identical purchases on the same day differ by their running balance...
    assert.notEqual(rowHash(base), rowHash({ ...base, balanceCents: 820252 }))
    // ...and zero-amount twins (same balance) by their occurrence.
    const zero = { ...base, amountCents: 0, balanceCents: 723731 }
    assert.notEqual(rowHash({ ...zero, occurrence: 1 }), rowHash({ ...zero, occurrence: 2 }))

    for (const change of [
      { accountNumber: '987654321' },
      { bankDate: '2026-08-19' },
      { amountCents: -3001 },
      { detailsRaw: 'V2222 15/08 PHONECO MOBILE NORTH SYDN 70000000401' },
    ]) {
      assert.notEqual(rowHash(base), rowHash({ ...base, ...change }))
    }
  })

  test('test_row_hash_follows_the_documented_recipe', ({ assert }) => {
    const expected = createHash('sha256')
      .update(
        '123456789|2026-08-18|-3000|V1111 15/08 PHONECO MOBILE NORTH SYDN 70000000401|817252|1'
      )
      .digest('hex')
    assert.equal(rowHash({ ...base, detailsRaw: `  ${base.detailsRaw} ` }), expected)
    assert.equal(
      rowHash({ ...base, balanceCents: null }),
      createHash('sha256')
        .update('123456789|2026-08-18|-3000|V1111 15/08 PHONECO MOBILE NORTH SYDN 70000000401||1')
        .digest('hex')
    )
  })

  test('test_occurrence_counts_identical_rows_in_file_order', ({ assert }) => {
    const zero = parsedRow({
      amountCents: 0,
      balanceCents: 723731,
      detailsRaw: 'POS 27/09 TRANSLINK',
    })
    const other = parsedRow({ amountCents: -2500, detailsRaw: 'V1111 27/09 TICKETS*SAMPLE FEST' })
    assert.deepEqual(assignOccurrences([zero, zero, other, zero]), [1, 2, 1, 3])
  })
})
