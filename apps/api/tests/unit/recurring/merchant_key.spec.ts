import { test } from '@japa/runner'
import { merchantKey } from '#domain/importing/normalize'
import { payeeMerchantKey, transactionMerchantKey } from '#domain/recurring/merchant_key'

test.group('Recurring: merchant keys', () => {
  test('test_an_imported_transaction_uses_the_key_of_its_bank_row', ({ assert }) => {
    assert.equal(
      transactionMerchantKey({
        bankMerchantKey: 'harbour lettings',
        payee: 'Rent',
        rawDescription: 'INTERNET TRANSFER HARBOUR LETTINGS 12345',
      }),
      'harbour lettings'
    )
  })

  test('test_a_typed_transaction_uses_its_payee_like_the_rules_do', ({ assert }) => {
    assert.equal(
      transactionMerchantKey({
        bankMerchantKey: null,
        payee: 'GrocerMart (Northvale Village)',
        rawDescription: null,
      }),
      'grocermart'
    )
    // No payee: the bank text without its noise.
    assert.equal(
      transactionMerchantKey({
        bankMerchantKey: '',
        payee: null,
        rawDescription: 'V1111 22/09 PULSE GYM 70000000999',
      }),
      'pulse gym'
    )
    assert.equal(
      transactionMerchantKey({ bankMerchantKey: null, payee: null, rawDescription: null }),
      ''
    )
  })

  test('test_a_manual_payee_gets_the_importer_key', ({ assert }) => {
    assert.equal(payeeMerchantKey('  Telco One (Prepaid) '), 'telco one')
    assert.equal(
      payeeMerchantKey('Café Nº 9'),
      merchantKey({ nabMerchant: 'Café Nº 9', description: 'Café Nº 9' })
    )
    assert.equal(payeeMerchantKey('12345'), '')
  })
})
