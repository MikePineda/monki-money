import { test } from '@japa/runner'
import { parseMailFrom, selectMailer } from '#services/mail/mail_settings'

test.group('Mail settings', () => {
  test('test_resend_is_used_only_when_its_key_is_present', ({ assert }) => {
    assert.equal(selectMailer({ driver: 'resend', resendKey: 're_123' }), 'resend')
    assert.equal(selectMailer({ driver: 'resend', resendKey: '' }), 'log')
    assert.equal(selectMailer({ driver: 'resend', resendKey: undefined }), 'log')
  })

  test('test_smtp_is_used_only_when_its_host_is_present', ({ assert }) => {
    assert.equal(selectMailer({ driver: 'smtp', smtpHost: 'smtp.test' }), 'smtp')
    assert.equal(selectMailer({ driver: 'smtp', smtpHost: '' }), 'log')
  })

  test('test_missing_driver_falls_back_to_the_log_no_op', ({ assert }) => {
    assert.equal(selectMailer({ driver: undefined }), 'log')
    assert.equal(selectMailer({ driver: 'log', resendKey: 're_123' }), 'log')
  })

  test('test_mail_from_parses_name_and_address', ({ assert }) => {
    assert.deepEqual(parseMailFrom('monkimoney <noreply@mail.example.test>', 'https://x.test'), {
      name: 'monkimoney',
      address: 'noreply@mail.example.test',
    })
    assert.equal(
      parseMailFrom('noreply@mail.example.test', 'https://x.test'),
      'noreply@mail.example.test'
    )
  })

  test('test_mail_from_defaults_to_a_noreply_address_on_the_app_host', ({ assert }) => {
    assert.deepEqual(parseMailFrom('', 'https://money.example.test', 'monkimoney'), {
      name: 'monkimoney',
      address: 'noreply@money.example.test',
    })
    assert.equal(parseMailFrom(undefined, 'http://localhost:3333'), 'noreply@localhost')
  })
})
