import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aGoal, aProjection } from '../../../testing/goal-fixtures'
import { httpError, networkError, validationError } from '../../../testing/session-fixtures'
import { ToastStore } from '../../core/ui/toast.store'
import type { GoalFields } from '../../domain/goals'
import { GoalsApi } from './data-access/goals.api'
import { GoalDetailStore } from './goal-detail.store'

const FIELDS: GoalFields = {
  name: 'Rainy day',
  targetCents: 600_000,
  targetDate: null,
  startingCents: 120_000,
  monthlyContributionCents: 40_000,
  accountId: null,
  userId: null,
}

describe('GoalDetailStore', () => {
  let api: {
    show: ReturnType<typeof vi.fn>
    projection: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }
  let toasts: { show: ReturnType<typeof vi.fn> }

  function setup() {
    api = {
      show: vi.fn(async (id: number) => aGoal({ id })),
      projection: vi.fn(async (id: number) => aProjection({ goalId: id })),
      update: vi.fn(async (id: number, body: Partial<GoalFields>) => aGoal({ id, ...body })),
      remove: vi.fn(async () => undefined),
    }
    toasts = { show: vi.fn() }
    TestBed.configureTestingModule({
      providers: [
        GoalDetailStore,
        { provide: GoalsApi, useValue: api },
        { provide: ToastStore, useValue: toasts },
      ],
    })
    const store = TestBed.inject(GoalDetailStore)
    store.open(7)
    return store
  }

  async function settle(): Promise<void> {
    TestBed.tick()
    await TestBed.inject(ApplicationRef).whenStable()
  }

  it('test_loads_the_goal_and_its_projection', async () => {
    const store = setup()
    expect(store.status()).toBe('loading')

    await settle()

    expect(store.status()).toBe('ready')
    expect(store.detail()?.goal.id).toBe(7)
    expect(store.detail()?.projection.goalId).toBe(7)
  })

  it('test_an_unknown_goal_is_not_found', async () => {
    const store = setup()
    api.show.mockRejectedValueOnce(httpError(404, { code: 'E_ROW_NOT_FOUND' }))

    await settle()

    expect(store.status()).toBe('notFound')
  })

  it('test_a_failed_load_is_an_error_with_retry', async () => {
    const store = setup()
    api.projection.mockRejectedValueOnce(networkError())
    await settle()
    expect(store.status()).toBe('error')

    store.retry()
    await settle()

    expect(store.status()).toBe('ready')
  })

  it('test_save_patches_the_goal_and_reloads_the_projection', async () => {
    const store = setup()
    await settle()

    const result = await store.save(FIELDS)
    await settle()

    expect(result).toEqual({ ok: true, fields: {} })
    expect(api.update).toHaveBeenCalledWith(7, FIELDS)
    expect(api.show).toHaveBeenCalledTimes(2)
    expect(api.projection).toHaveBeenCalledTimes(2)
    expect(store.status()).toBe('ready')
  })

  it('test_a_refused_save_returns_the_field_messages', async () => {
    const store = setup()
    await settle()
    api.update.mockRejectedValueOnce(validationError({ targetCents: 'Must be above zero' }))

    const result = await store.save(FIELDS)

    expect(result).toEqual({ ok: false, fields: { targetCents: 'Must be above zero' } })
    expect(toasts.show).not.toHaveBeenCalled()
  })

  it('test_a_save_that_fails_otherwise_says_so_in_a_toast', async () => {
    const store = setup()
    await settle()
    api.update.mockRejectedValueOnce(networkError())

    const result = await store.save(FIELDS)

    expect(result).toEqual({ ok: false, fields: {} })
    expect(toasts.show).toHaveBeenCalledWith(expect.objectContaining({ status: 'critical' }))
  })

  it('test_status_changes_patch_the_status_and_announce_it', async () => {
    const store = setup()
    await settle()

    expect(await store.setStatus('reached')).toBe(true)

    expect(api.update).toHaveBeenCalledWith(7, { status: 'reached' })
    expect(toasts.show).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: 'goals.detail.toast.reached',
        params: { name: 'Emergency fund' },
      })
    )
  })

  it('test_delete_removes_the_goal_and_announces_it', async () => {
    const store = setup()
    await settle()

    expect(await store.remove()).toBe(true)

    expect(api.remove).toHaveBeenCalledWith(7)
    expect(toasts.show).toHaveBeenCalledWith(
      expect.objectContaining({ messageKey: 'goals.detail.toast.deleted' })
    )
  })

  it('test_a_failed_delete_keeps_the_goal', async () => {
    const store = setup()
    await settle()
    api.remove.mockRejectedValueOnce(networkError())

    expect(await store.remove()).toBe(false)
    expect(store.status()).toBe('ready')
  })
})
