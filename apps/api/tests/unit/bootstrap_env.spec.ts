import { test } from '@japa/runner'
import { readBootstrapInput, readSeedPlan } from '#services/bootstrap/bootstrap_env'

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

const smoke: Record<string, string> = {
  SMOKE_EMAIL: 'Smoke@Example.test',
  SMOKE_PASSWORD: 'smoke-password-123',
}

test.group('Production bootstrap env: seed plan', () => {
  test('test_the_plan_has_the_household_and_the_smoke_user_when_both_are_set', async ({
    assert,
  }) => {
    const plan = await readSeedPlan(from({ ...complete, ...smoke }))

    assert.equal(plan.household?.owner.email, 'owner@example.test')
    assert.deepEqual(plan.smoke, { email: 'smoke@example.test', password: 'smoke-password-123' })
  })

  test('test_the_smoke_user_can_be_seeded_without_the_household', async ({ assert }) => {
    // SEED_LOCALE alone does not count: .env.example ships it with a default.
    const plan = await readSeedPlan(from({ ...smoke, SEED_LOCALE: 'en' }))

    assert.isNull(plan.household)
    assert.equal(plan.smoke?.email, 'smoke@example.test')
  })

  test('test_the_household_can_be_seeded_without_the_smoke_user', async ({ assert }) => {
    const plan = await readSeedPlan(from(complete))

    assert.equal(plan.household?.householdName, 'Synthetic Home')
    assert.isNull(plan.smoke)
  })

  test('test_any_household_variable_makes_the_whole_household_block_required', async ({
    assert,
  }) => {
    await assert.rejects(
      () => readSeedPlan(from({ ...smoke, SEED_USER1_CARD_SUFFIX: '1111' })),
      /SEED_HOUSEHOLD_NAME[\s\S]*SEED_USER1_PASSWORD/
    )
  })

  test('test_a_partial_smoke_user_is_rejected', async ({ assert }) => {
    await assert.rejects(
      () => readSeedPlan(from({ ...complete, SMOKE_EMAIL: 'smoke@example.test' })),
      /SMOKE_PASSWORD/
    )
    await assert.rejects(
      () => readSeedPlan(from({ ...complete, SMOKE_PASSWORD: 'smoke-password-123' })),
      /SMOKE_EMAIL/
    )
  })

  test('test_invalid_smoke_values_fail_without_echoing_the_password', async ({ assert }) => {
    try {
      await readSeedPlan(from({ SMOKE_EMAIL: 'not-an-email', SMOKE_PASSWORD: 'short' }))
      assert.fail('should have thrown')
    } catch (error) {
      assert.match((error as Error).message, /SMOKE_EMAIL[\s\S]*SMOKE_PASSWORD/)
      assert.notInclude((error as Error).message, 'short')
    }
  })

  test('test_the_smoke_user_can_never_be_one_of_the_household_users', async ({ assert }) => {
    for (const email of ['OWNER@example.test', 'member@example.test']) {
      await assert.rejects(
        () => readSeedPlan(from({ ...complete, ...smoke, SMOKE_EMAIL: email })),
        /SMOKE_EMAIL/
      )
    }
  })

  test('test_an_empty_plan_is_an_error', async ({ assert }) => {
    await assert.rejects(() => readSeedPlan(from({ SEED_LOCALE: 'en' })), /nothing to seed/)
  })
})
