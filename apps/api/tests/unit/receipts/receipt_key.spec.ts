import { test } from '@japa/runner'
import {
  RECEIPTS_PREFIX,
  isReceiptUploadType,
  receiptKey,
  receiptKeyHousehold,
} from '#domain/receipts/receipt_key'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

test.group('Receipt keys', () => {
  test('test_receipt_key_is_scoped_by_household_with_the_type_extension', ({ assert }) => {
    assert.equal(receiptKey(42, ID, 'image/jpeg'), `receipts/42/${ID}.jpg`)
    assert.equal(receiptKey(42, ID, 'image/png'), `receipts/42/${ID}.png`)
    assert.equal(receiptKey(42, ID, 'image/webp'), `receipts/42/${ID}.webp`)
    assert.isTrue(receiptKey(42, ID, 'image/jpeg').startsWith(RECEIPTS_PREFIX))
  })

  test('test_receipt_key_household_reads_only_generated_keys', ({ assert }) => {
    assert.equal(receiptKeyHousehold(`receipts/42/${ID}.webp`), 42)

    const rejected = [
      `receipts/0/${ID}.jpg`,
      `receipts/042/${ID}.jpg`,
      `receipts/42/${ID}.gif`,
      `receipts/42/${ID.toUpperCase()}.jpg`,
      `receipts/42/../7/${ID}.jpg`,
      `receipts/42/sub/${ID}.jpg`,
      `/receipts/42/${ID}.jpg`,
      `imports/42/${ID}.jpg`,
      `receipts/42/${ID}.jpg?x=1`,
      `receipts/42/${ID}.jpg\n`,
      `receipts/99999999999/${ID}.jpg`,
      'receipts/42/not-a-uuid.jpg',
      '',
    ]
    for (const key of rejected) assert.isNull(receiptKeyHousehold(key), JSON.stringify(key))
  })

  test('test_receipt_upload_types_are_jpeg_png_and_webp', ({ assert }) => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      assert.isTrue(isReceiptUploadType(type), type)
    }
    for (const type of ['image/gif', 'image/heic', 'application/pdf', null, undefined, 3]) {
      assert.isFalse(isReceiptUploadType(type), String(type))
    }
  })
})
