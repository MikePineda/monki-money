import { test } from '@japa/runner'
import type User from '#models/user'
import type Household from '#models/household'
import HouseholdMember from '#models/household_member'
import limiter from '@adonisjs/limiter/services/main'
import { createHousehold } from '#tests/helpers/household'
import { FACTORY_PASSWORD } from '#database/factories/user_factory'
import HouseholdOwnershipTransfer from '#models/household_ownership_transfer'

const URL = '/api/v1/household/transfer-ownership'

/** `{ userId: role }` of every member of the household. */
async function roles(household: Household) {
  const members = await HouseholdMember.query().where('household_id', household.id)
  return Object.fromEntries(members.map((member) => [member.userId, member.role]))
}

function rolesOf(owner: User, member: User) {
  return { [owner.id]: 'owner', [member.id]: 'member' }
}

test.group('Household / ownership transfer', (group) => {
  group.each.setup(() => limiter.clear())

  test('test_owner_makes_the_partner_owner_and_becomes_a_member', async ({ client, assert }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })

    const response = await client
      .post(URL)
      .json({ userId: member.id, password: FACTORY_PASSWORD })
      .actingAs(owner)

    response.assertStatus(200)
    assert.deepEqual(await roles(household), rolesOf(member, owner))
    // The answer is the members list with the new roles.
    assert.sameDeepMembers(
      response.body().data.map((row: { userId: number; role: string }) => ({
        userId: row.userId,
        role: row.role,
      })),
      [
        { userId: owner.id, role: 'member' },
        { userId: member.id, role: 'owner' },
      ]
    )
    // Audited: who handed it over, to whom, when.
    const audit = await HouseholdOwnershipTransfer.query().where('household_id', household.id)
    assert.lengthOf(audit, 1)
    assert.include(audit[0].serialize(), { fromUserId: owner.id, toUserId: member.id })
    assert.isNotNull(audit[0].createdAt)
  })

  test('test_the_new_owner_manages_the_household_and_the_former_one_no_longer_can', async ({
    client,
  }) => {
    const { owner, member } = await createHousehold({ users: 2 })
    const transfer = await client
      .post(URL)
      .json({ userId: member.id, password: FACTORY_PASSWORD })
      .actingAs(owner)
    transfer.assertStatus(200)

    const byNewOwner = await client
      .patch('/api/v1/household')
      .json({ name: 'Renamed' })
      .actingAs(member)
    const byFormerOwner = await client
      .patch('/api/v1/household')
      .json({ name: 'Hijacked' })
      .actingAs(owner)

    byNewOwner.assertStatus(200)
    byNewOwner.assertBodyContains({ data: { name: 'Renamed' } })
    byFormerOwner.assertStatus(403)
  })

  test('test_transfer_ownership_rejects_a_wrong_password', async ({ client, assert }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })

    const response = await client
      .post(URL)
      .json({ userId: member.id, password: 'not-the-password' })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'password', rule: 'matches' }] })
    assert.deepEqual(await roles(household), rolesOf(owner, member))
    assert.lengthOf(await HouseholdOwnershipTransfer.query().where('household_id', household.id), 0)
  })

  test('test_transfer_ownership_password_attempts_are_throttled_per_user', async ({
    client,
    assert,
  }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })

    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await client
        .post(URL)
        .json({ userId: member.id, password: 'not-the-password' })
        .actingAs(owner)
      response.assertStatus(422)
    }

    const blocked = await client
      .post(URL)
      .json({ userId: member.id, password: FACTORY_PASSWORD })
      .actingAs(owner)
    blocked.assertStatus(429)
    assert.deepEqual(await roles(household), rolesOf(owner, member))
  })

  test('test_a_member_cannot_transfer_ownership', async ({ client, assert }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })

    const response = await client
      .post(URL)
      .json({ userId: member.id, password: FACTORY_PASSWORD })
      .actingAs(member)

    response.assertStatus(403)
    assert.deepEqual(await roles(household), rolesOf(owner, member))
  })

  test('test_transfer_ownership_to_a_user_of_another_household_is_not_found', async ({
    client,
    assert,
  }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })
    const other = await createHousehold({ users: 2 })

    for (const stranger of [other.owner, other.member]) {
      const response = await client
        .post(URL)
        .json({ userId: stranger.id, password: FACTORY_PASSWORD })
        .actingAs(owner)
      response.assertStatus(404)
      response.assertBodyContains({ code: 'E_ROW_NOT_FOUND' })
    }
    const unknown = await client
      .post(URL)
      .json({ userId: 2_000_000_000, password: FACTORY_PASSWORD })
      .actingAs(owner)
    unknown.assertStatus(404)

    assert.deepEqual(await roles(household), rolesOf(owner, member))
    assert.deepEqual(await roles(other.household), rolesOf(other.owner, other.member))
    assert.lengthOf(await HouseholdOwnershipTransfer.query().where('household_id', household.id), 0)
  })

  test('test_transfer_ownership_to_yourself_is_rejected', async ({ client, assert }) => {
    const { household, owner, member } = await createHousehold({ users: 2 })

    const response = await client
      .post(URL)
      .json({ userId: owner.id, password: FACTORY_PASSWORD })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'userId', rule: 'self' }] })
    assert.deepEqual(await roles(household), rolesOf(owner, member))
  })

  test('test_transfer_ownership_validates_its_body', async ({ client, assert }) => {
    const { owner } = await createHousehold({ users: 2 })

    const response = await client.post(URL).json({}).actingAs(owner)

    response.assertStatus(422)
    assert.sameMembers(
      response.body().errors.map((error: { field: string }) => error.field),
      ['userId', 'password']
    )
  })

  test('test_the_former_owner_can_leave_after_transferring_ownership', async ({
    client,
    assert,
  }) => {
    const { household, owner, member, accounts } = await createHousehold({
      users: 2,
      accounts: [{ name: 'Owner wallet', owner: 0 }],
    })
    const transfer = await client
      .post(URL)
      .json({ userId: member.id, password: FACTORY_PASSWORD })
      .actingAs(owner)
    transfer.assertStatus(200)

    const leave = await client.post('/api/v1/household/leave').actingAs(owner)

    leave.assertStatus(204)
    assert.deepEqual(await roles(household), { [member.id]: 'owner' })
    await owner.refresh()
    assert.isNull(owner.currentHouseholdId)
    // The former owner's personal account stays with the household, joint.
    await accounts[0].refresh()
    assert.isNull(accounts[0].ownerUserId)
  })
})
