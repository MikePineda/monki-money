import { test } from '@japa/runner'
import Household from '#models/household'
import { errors } from '@adonisjs/bouncer'
import { MemberNotFound, OwnerCannotLeave } from '#exceptions/errors'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import HouseholdMember from '#models/household_member'
import { createHousehold } from '#tests/helpers/household'
import { FACTORY_PASSWORD } from '#database/factories/user_factory'
import HouseholdService from '#services/households/household_service'
import { untilSomeoneWaitsOnALock, withoutGlobalTransaction } from '#tests/helpers/committed'

/**
 * Role changes racing on real connections. Another transaction holds both
 * memberships while it hands the household over; a leave or a delete that
 * started from the roles it read before must decide on the committed ones.
 */
test.group('Household concurrency', () => {
  type Cleanup = (callback: () => Promise<void>) => void

  /** A transaction of "another request", rolled back if the test stops before it ends. */
  async function anotherRequest(cleanup: Cleanup) {
    const other = await db.transaction()
    // Cleanups run last-registered first: before the committed fixture is deleted.
    cleanup(async () => {
      if (!other.isCompleted) await other.rollback()
    })
    return other
  }

  /** An uncommitted handover from the owner to the member, holding both rows. */
  async function handoverInFlight(cleanup: Cleanup, householdId: number, from: number, to: number) {
    const other = await anotherRequest(cleanup)
    await other
      .from('household_members')
      .where('household_id', householdId)
      .whereIn('user_id', [from, to])
      .forUpdate()
    await other
      .from('household_members')
      .where('household_id', householdId)
      .where('user_id', from)
      .update({ role: 'member' })
    await other
      .from('household_members')
      .where('household_id', householdId)
      .where('user_id', to)
      .update({ role: 'owner' })
    return other
  }

  test('test_a_member_promoted_while_leaving_stays_as_the_owner', async ({ assert, cleanup }) => {
    const committed = await withoutGlobalTransaction(cleanup)
    const { household, owner, member, memberships } = committed.track(
      await createHousehold({ users: 2 })
    )
    const service = await app.container.make(HouseholdService)
    // What the middleware loaded for the member's request: still a member.
    const asLoaded = memberships[1]

    const other = await handoverInFlight(cleanup, household.id, owner.id, member.id)
    // Caught at once: the rejection can land before the test reaches its assertion.
    const leaving = service.leave(asLoaded, member).catch((error) => error)
    await untilSomeoneWaitsOnALock()
    await other.commit()

    assert.instanceOf(await leaving, OwnerCannotLeave)
    const rows = await HouseholdMember.query().where('household_id', household.id)
    assert.sameDeepMembers(
      rows.map((row) => ({ userId: row.userId, role: row.role })),
      [
        { userId: owner.id, role: 'member' },
        { userId: member.id, role: 'owner' },
      ]
    )
    await member.refresh()
    assert.equal(member.currentHouseholdId, household.id)
  })

  test('test_an_owner_demoted_while_deleting_cannot_schedule_the_deletion', async ({
    assert,
    cleanup,
  }) => {
    const committed = await withoutGlobalTransaction(cleanup)
    const { household, owner, member } = committed.track(await createHousehold({ users: 2 }))
    const service = await app.container.make(HouseholdService)

    const other = await handoverInFlight(cleanup, household.id, owner.id, member.id)
    const deleting = service
      .scheduleDeletion(household, owner, FACTORY_PASSWORD)
      .catch((error) => error)
    await untilSomeoneWaitsOnALock()
    await other.commit()

    assert.instanceOf(await deleting, errors.E_AUTHORIZATION_FAILURE)
    const fresh = await Household.findOrFail(household.id)
    assert.equal(fresh.status, 'active')
    assert.isNull(fresh.deletionScheduledAt)
  })

  test('test_a_member_who_left_while_promoted_is_not_found', async ({ assert, cleanup }) => {
    const committed = await withoutGlobalTransaction(cleanup)
    const { household, owner, member } = committed.track(await createHousehold({ users: 2 }))
    const service = await app.container.make(HouseholdService)

    // The member's leave holds their row; the handover waits, then finds nobody.
    const other = await anotherRequest(cleanup)
    await other
      .from('household_members')
      .where('household_id', household.id)
      .where('user_id', member.id)
      .forUpdate()
    const handover = service
      .transferOwnership(household, owner, member.id, FACTORY_PASSWORD)
      .catch((error) => error)
    await untilSomeoneWaitsOnALock()
    await other
      .from('household_members')
      .where('household_id', household.id)
      .where('user_id', member.id)
      .delete()
    await other.commit()

    assert.instanceOf(await handover, MemberNotFound)
    const rows = await HouseholdMember.query().where('household_id', household.id)
    assert.deepEqual(
      rows.map((row) => ({ userId: row.userId, role: row.role })),
      [{ userId: owner.id, role: 'owner' }]
    )
  })
})
