import { test } from '@japa/runner'
import User from '#models/user'
import Household from '#models/household'
import { createHousehold } from '#tests/helpers/household'
import { E2E_OWNER_EMAIL, E2E_PASSWORD } from '#services/e2e/e2e_seed'
import { shouldRegisterE2eRoutes } from '#start/routes/e2e'

test.group('E2E routes', () => {
  test('test_reset_route_is_absent_outside_test_mode', ({ assert }) => {
    assert.isFalse(shouldRegisterE2eRoutes({ inTest: false, e2eMode: false }))
    assert.isFalse(shouldRegisterE2eRoutes({ inTest: false, e2eMode: undefined }))
    assert.isTrue(shouldRegisterE2eRoutes({ inTest: true, e2eMode: false }))
    assert.isTrue(shouldRegisterE2eRoutes({ inTest: false, e2eMode: true }))
  })

  test('test_reset_wipes_the_database_and_seeds_the_e2e_household', async ({ client, assert }) => {
    const leftover = await createHousehold({ name: 'Leftover' })

    const response = await client.post('/api/test/reset')

    response.assertStatus(200)
    assert.isNull(await Household.find(leftover.household.id))
    const [household] = await Household.all()
    assert.equal(household.name, 'E2E')
    assert.deepInclude(response.body().data.users, {
      email: E2E_OWNER_EMAIL,
      password: E2E_PASSWORD,
      role: 'owner',
    })
    const owner = await User.findByOrFail('email', E2E_OWNER_EMAIL)
    assert.equal(owner.currentHouseholdId, household.id)
  })

  test('test_e2e_users_can_log_in_after_a_reset', async ({ client }) => {
    await client.post('/api/test/reset')

    const login = await client
      .post('/api/v1/auth/login')
      .json({ email: E2E_OWNER_EMAIL, password: E2E_PASSWORD })
      .withCsrfToken()

    login.assertStatus(200)
    login.assertBodyContains({ data: { household: { name: 'E2E' } } })
  })
})
