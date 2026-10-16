import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_RECEIPT_BYTES,
  RECEIPT_UPLOAD_TYPES,
  isReceiptUploadType,
  receiptUploadProblem,
} from './receipts.ts'

test('a receipt photo may be a jpeg, a png or a webp', () => {
  assert.deepEqual([...RECEIPT_UPLOAD_TYPES], ['image/jpeg', 'image/png', 'image/webp'])
  assert.equal(isReceiptUploadType('image/webp'), true)
  assert.equal(isReceiptUploadType('image/heic'), false)
  assert.equal(isReceiptUploadType(undefined), false)
})

test('a receipt photo is at most 10 MB', () => {
  assert.equal(MAX_RECEIPT_BYTES, 10 * 1024 * 1024)
})

test('an upload within the limits has no problem', () => {
  assert.equal(receiptUploadProblem({ type: 'image/jpeg', size: 1 }), null)
  assert.equal(receiptUploadProblem({ type: 'image/webp', size: MAX_RECEIPT_BYTES }), null)
})

test('an upload of another type is refused before its size is looked at', () => {
  assert.equal(receiptUploadProblem({ type: 'image/heic', size: 1 }), 'type')
  assert.equal(receiptUploadProblem({ type: '', size: MAX_RECEIPT_BYTES + 1 }), 'type')
})

test('an empty upload or one over 10 MB is the wrong size', () => {
  assert.equal(receiptUploadProblem({ type: 'image/png', size: MAX_RECEIPT_BYTES + 1 }), 'size')
  assert.equal(receiptUploadProblem({ type: 'image/png', size: 0 }), 'size')
})
