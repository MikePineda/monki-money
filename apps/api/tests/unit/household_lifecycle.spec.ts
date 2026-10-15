import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { canRestore, deletionDate, DELETION_GRACE_DAYS } from '#domain/households/deletion_window'
import { generateInvitationToken, hashInvitationToken } from '#domain/households/invitation_token'

const now = DateTime.fromISO('2026-10-15T09:00:00Z')

test.group('Household lifecycle', () => {
  test('test_deletion_is_scheduled_thirty_days_ahead', ({ assert }) => {
    assert.equal(DELETION_GRACE_DAYS, 30)
    assert.equal(deletionDate(now).toISO(), now.plus({ days: 30 }).toISO())
  })

  test('test_restore_is_possible_only_before_the_scheduled_date', ({ assert }) => {
    assert.isTrue(canRestore(now.plus({ minutes: 1 }), now))
    assert.isFalse(canRestore(now.minus({ minutes: 1 }), now))
    assert.isFalse(canRestore(null, now))
  })

  test('test_invitation_tokens_are_random_url_safe_and_hashed_with_sha256', ({ assert }) => {
    const first = generateInvitationToken()
    const second = generateInvitationToken()

    assert.notEqual(first, second)
    assert.match(first, /^[A-Za-z0-9_-]{43}$/)
    assert.match(hashInvitationToken(first), /^[a-f0-9]{64}$/)
    assert.equal(hashInvitationToken(first), hashInvitationToken(first))
    assert.notEqual(hashInvitationToken(first), hashInvitationToken(second))
  })
})
