import { test } from '@japa/runner'
import { reachAction } from '#domain/goals/reached'

test.group('Goals: reached announcement', () => {
  test('test_an_active_goal_at_its_target_not_told_yet_is_announced', ({ assert }) => {
    assert.equal(reachAction({ status: 'active', notified: false, remainingCents: 0 }), 'announce')
  })

  test('test_a_goal_already_told_about_this_reach_is_left_alone', ({ assert }) => {
    assert.equal(reachAction({ status: 'active', notified: true, remainingCents: 0 }), 'none')
  })

  test('test_a_goal_short_of_its_target_again_is_rearmed_for_the_next_reach', ({ assert }) => {
    for (const status of ['active', 'reached', 'archived'] as const) {
      assert.equal(reachAction({ status, notified: true, remainingCents: 1 }), 'rearm', status)
    }
  })

  test('test_a_goal_short_of_its_target_and_not_told_needs_nothing', ({ assert }) => {
    assert.equal(reachAction({ status: 'active', notified: false, remainingCents: 500 }), 'none')
  })

  test('test_a_goal_marked_reached_or_archived_is_never_announced', ({ assert }) => {
    // Someone already said so on screen, or put the goal away.
    assert.equal(reachAction({ status: 'reached', notified: false, remainingCents: 0 }), 'none')
    assert.equal(reachAction({ status: 'archived', notified: false, remainingCents: 0 }), 'none')
  })
})
