import { test } from '@japa/runner'
import User from '#models/user'
import { promisify } from 'node:util'
import Household from '#models/household'
import app from '@adonisjs/core/services/app'
import { execFile } from 'node:child_process'
import router from '@adonisjs/core/services/router'
import { createHousehold } from '#tests/helpers/household'
import { E2E_OWNER_EMAIL, E2E_PASSWORD } from '#services/e2e/e2e_seed'

const run = promisify(execFile)

/** Route patterns of the app booted in another process with the given env. */
async function routePatterns(env: Record<string, string>) {
  const { stdout } = await run(process.execPath, ['ace', 'list:routes', '--json'], {
    cwd: app.makePath(),
    env: { ...process.env, ...env },
  })
  const domains: Array<{ routes: Array<{ pattern: string }> }> = JSON.parse(stdout)
  return domains.flatMap((domain) => domain.routes.map((route) => route.pattern))
}

test.group('Test-support routes', () => {
  test('test_reset_route_is_absent_outside_test_mode', async ({ assert }) => {
    const development = await routePatterns({ NODE_ENV: 'development', E2E_MODE: '' })
    assert.include(development, '/api/v1/config')
    assert.notInclude(development, '/api/test/reset')
    assert.notInclude(development, '/api/test/outbox')

    const e2e = await routePatterns({ NODE_ENV: 'development', E2E_MODE: 'true' })
    assert.includeMembers(e2e, ['/api/test/reset', '/api/test/outbox'])

    const testMode = Object.values(router.toJSON())
      .flat()
      .map((route) => route.pattern)
    assert.includeMembers(testMode, ['/api/test/reset', '/api/test/outbox'])
  }).timeout(30_000)

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

  test('test_outbox_lists_the_verify_link_after_a_signup', async ({ client, assert }) => {
    await client.post('/api/test/reset')

    const signup = await client
      .post('/api/v1/auth/signup')
      .json({
        fullName: 'Outbox Example',
        email: 'outbox@example.test',
        password: 'long-enough-pw',
      })
      .withCsrfToken()
    signup.assertStatus(201)

    const outbox = await client.get('/api/test/outbox')

    outbox.assertStatus(200)
    const entries = outbox.body().data
    assert.lengthOf(entries, 1)
    assert.deepInclude(entries[0], { to: ['outbox@example.test'], subject: 'Confirm your email' })
    assert.lengthOf(entries[0].links, 1)
    assert.match(entries[0].links[0], /^http:\/\/127\.0\.0\.1:3333\/verify-email\?token=/)
    assert.lengthOf(entries[0].codes, 1)
    assert.match(entries[0].codes[0], /^\d{6}$/)
    assert.isString(entries[0].sentAt)
  })

  test('test_reset_clears_the_outbox', async ({ client, assert }) => {
    await client.post('/api/test/reset')
    await client
      .post('/api/v1/auth/signup')
      .json({
        fullName: 'Outbox Example',
        email: 'outbox@example.test',
        password: 'long-enough-pw',
      })
      .withCsrfToken()

    await client.post('/api/test/reset')
    const outbox = await client.get('/api/test/outbox')

    assert.deepEqual(outbox.body().data, [])
  })
})
