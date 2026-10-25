import { test } from '@japa/runner'
import { merchantKey } from '#domain/importing/normalize'
import {
  keysNameTheSameMerchant,
  looseMerchantKey,
  payeeMerchantKey,
  transactionMerchantKey,
} from '#domain/recurring/merchant_key'

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

  test('test_the_loose_key_drops_domain_and_company_words', ({ assert }) => {
    assert.equal(looseMerchantKey('streamflix com au'), 'streamflix')
    assert.equal(looseMerchantKey('telco one pty ltd'), 'telco one')
    assert.equal(looseMerchantKey('the pulse gym'), 'pulse gym')
    assert.equal(looseMerchantKey('pty ltd'), '', 'nothing but noise: no loose key')
  })

  test('test_a_typed_name_names_the_bank_merchant_once_the_noise_words_drop', ({ assert }) => {
    // Typed "StreamFlix"; the bank prints STREAMFLIX.COM.
    assert.isTrue(keysNameTheSameMerchant('streamflix', 'streamflix com'))
    assert.isTrue(keysNameTheSameMerchant('telco one', 'telco one pty ltd'))
    assert.isTrue(keysNameTheSameMerchant('rent', 'rent'))
  })

  test('test_different_merchants_never_name_each_other', ({ assert }) => {
    // Not a prefix, not a substring, not one word of several.
    assert.isFalse(keysNameTheSameMerchant('rent', 'rentokil pest'))
    assert.isFalse(keysNameTheSameMerchant('rent', 'rent harbour lettings'))
    assert.isFalse(keysNameTheSameMerchant('streamflix', 'streamflix games'))
    assert.isFalse(keysNameTheSameMerchant('telco one', 'telco two'))
    assert.isFalse(keysNameTheSameMerchant('gym', 'pulse gym'))
    // Only noise on either side never names anything.
    assert.isFalse(keysNameTheSameMerchant('pty ltd', 'com'))
    assert.isFalse(keysNameTheSameMerchant('', ''))
  })
})
