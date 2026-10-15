import { test } from '@japa/runner'
import { PRODUCTION_SCRYPT, TEST_SCRYPT } from '#config/hash'

test.group('Password hashing', () => {
  test('test_scrypt_meets_the_owasp_minimum_outside_tests', ({ assert }) => {
    // OWASP Password Storage Cheat Sheet: N >= 2^17, r = 8, p = 1.
    assert.isAtLeast(PRODUCTION_SCRYPT.cost, 2 ** 17)
    assert.equal(PRODUCTION_SCRYPT.blockSize, 8)
    assert.isAtLeast(PRODUCTION_SCRYPT.parallelization, 1)
    // Node refuses to hash when 128 * N * r exceeds maxMemory.
    assert.isAbove(
      PRODUCTION_SCRYPT.maxMemory,
      128 * PRODUCTION_SCRYPT.cost * PRODUCTION_SCRYPT.blockSize
    )
  })

  test('test_the_cheap_parameters_are_only_for_the_test_suite', ({ assert }) => {
    assert.isBelow(TEST_SCRYPT.cost, PRODUCTION_SCRYPT.cost)
  })
})
