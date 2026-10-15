import { test } from '@japa/runner'
import { readBootstrapInput } from '#services/bootstrap/bootstrap_env'

const complete: Record<string, string> = {
  SEED_HOUSEHOLD_NAME: 'Synthetic Home',
  SEED_LOCALE: 'en',
  SEED_USER1_EMAIL: 'Owner@Example.test',
  SEED_USER1_NAME: 'Olive Owner',
  SEED_USER1_PASSWORD: 'owner-password-123',
  SEED_USER1_CARD_SUFFIX: '1111',
  SEED_USER2_EMAIL: 'member@example.test',
  SEED_USER2_NAME: 'Mel Member',
  SEED_USER2_PASSWORD: 'member-password-123',
  SEED_USER2_CARD_SUFFIX: '2222',
  SEED_JOINT_ACCOUNT_NUMBER: '000111222',
}

const from = (values: Record<string, string | undefined>) => (key: string) => values[key]

test.group('Production bootstrap env', () => {
  test('test_reads_the_flat_seed_variables', async ({ assert }) => {
    const input = await readBootstrapInput(from(complete))

    assert.deepEqual(input, {
      householdName: 'Synthetic Home',
      locale: 'en',
      owner: {
        email: 'owner@example.test',
        fullName: 'Olive Owner',
        password: 'owner-password-123',
        cardSuffix: '1111',
      },
      member: {
        email: 'member@example.test',
        fullName: 'Mel Member',
        password: 'member-password-123',
        cardSuffix: '2222',
      },
      jointAccountNumber: '000111222',
    })
  })

  test('test_the_second_user_and_the_bank_details_are_optional', async ({ assert }) => {
    const input = await readBootstrapInput(
      from({
        SEED_HOUSEHOLD_NAME: 'Solo',
        SEED_USER1_EMAIL: 'owner@example.test',
        SEED_USER1_NAME: 'Olive Owner',
        SEED_USER1_PASSWORD: 'owner-password-123',
      })
    )

    assert.isNull(input.member)
    assert.isNull(input.jointAccountNumber)
    assert.isNull(input.owner.cardSuffix)
    assert.equal(input.locale, 'en')
  })

  test('test_missing_required_values_fail_with_the_variable_names', async ({ assert }) => {
    await assert.rejects(
      () => readBootstrapInput(from({ SEED_USER1_EMAIL: 'not-an-email' })),
      /SEED_HOUSEHOLD_NAME[\s\S]*SEED_USER1_EMAIL/
    )
  })

  test('test_a_partial_second_user_is_rejected', async ({ assert }) => {
    await assert.rejects(
      () => readBootstrapInput(from({ ...complete, SEED_USER2_PASSWORD: '' })),
      /SEED_USER2_PASSWORD/
    )
  })

  test('test_error_messages_never_echo_passwords', async ({ assert }) => {
    try {
      await readBootstrapInput(from({ ...complete, SEED_USER1_PASSWORD: 'short' }))
      assert.fail('should have thrown')
    } catch (error) {
      assert.match((error as Error).message, /SEED_USER1_PASSWORD/)
      assert.notInclude((error as Error).message, 'short')
    }
  })
})
