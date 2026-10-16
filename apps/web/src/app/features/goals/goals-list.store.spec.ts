import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aGoalWithProjection } from '../../../testing/goal-fixtures'
import { networkError } from '../../../testing/session-fixtures'
import { ToastStore } from '../../core/ui/toast.store'
import { GoalsApi } from './data-access/goals.api'
import { GoalsListStore } from './goals-list.store'

describe('GoalsListStore', () => {
  let api: {
    listWithProjections: ReturnType<typeof vi.fn>
    projection: ReturnType<typeof vi.fn>
    reorder: ReturnType<typeof vi.fn>
  }
  let toasts: { show: ReturnType<typeof vi.fn> }

  function setup() {
    api = {
      listWithProjections: vi.fn(async (status: string) =>
        status === 'active'
          ? [
              aGoalWithProjection({ id: 1, name: 'Emergency fund' }),
              aGoalWithProjection({ id: 2, name: 'Holiday' }),
              aGoalWithProjection({ id: 3, name: 'New car' }, null),
            ]
          : [aGoalWithProjection({ id: 9, name: 'Laptop', status: 'reached' })]
      ),
      projection: vi.fn(),
      reorder: vi.fn(async () => undefined),
    }
    toasts = { show: vi.fn() }
    TestBed.configureTestingModule({
      providers: [
        GoalsListStore,
        { provide: GoalsApi, useValue: api },
        { provide: ToastStore, useValue: toasts },
      ],
    })
    return TestBed.inject(GoalsListStore)
  }

  async function settle(): Promise<void> {
    TestBed.tick()
    await TestBed.inject(ApplicationRef).whenStable()
  }

  function names(store: GoalsListStore): string[] {
    return store.rows().map((row) => row.goal.name)
  }

  it('test_loads_the_active_goals_with_their_projections_in_one_call', async () => {
    const store = setup()
    expect(store.status()).toBe('loading')

    await settle()

    expect(store.status()).toBe('ready')
    expect(api.listWithProjections).toHaveBeenCalledTimes(1)
    expect(api.listWithProjections).toHaveBeenCalledWith('active')
    expect(api.projection).not.toHaveBeenCalled()
    expect(names(store)).toEqual(['Emergency fund', 'Holiday', 'New car'])
    expect(store.rows()[1]?.projection?.goalId).toBe(2)
    expect(store.rows()[1]?.goal).not.toHaveProperty('projection')
  })

  it('test_a_filter_chip_loads_that_status', async () => {
    const store = setup()
    await settle()

    store.filter.set('reached')
    await settle()

    expect(api.listWithProjections).toHaveBeenLastCalledWith('reached')
    expect(names(store)).toEqual(['Laptop'])
  })

  it('test_a_goal_the_api_sends_without_a_projection_keeps_none', async () => {
    const store = setup()

    await settle()

    expect(store.status()).toBe('ready')
    expect(store.rows()[2]?.projection).toBeNull()
    expect(store.rows()[0]?.projection).not.toBeNull()
  })

  it('test_a_failed_list_is_an_error_with_retry', async () => {
    const store = setup()
    api.listWithProjections.mockRejectedValueOnce(networkError())
    await settle()
    expect(store.status()).toBe('error')

    store.retry()
    await settle()

    expect(store.status()).toBe('ready')
  })

  it('test_step_moves_a_goal_and_saves_the_new_order', async () => {
    const store = setup()
    await settle()

    await store.step(3, -1)

    expect(names(store)).toEqual(['Emergency fund', 'New car', 'Holiday'])
    expect(api.reorder).toHaveBeenCalledWith([1, 3, 2])
  })

  it('test_a_drop_moves_a_goal_to_its_new_position', async () => {
    const store = setup()
    await settle()

    await store.move(0, 2)

    expect(names(store)).toEqual(['Holiday', 'New car', 'Emergency fund'])
    expect(api.reorder).toHaveBeenCalledWith([2, 3, 1])
  })

  it('test_a_refused_reorder_rolls_back_and_says_so', async () => {
    const store = setup()
    await settle()
    api.reorder.mockRejectedValueOnce(networkError())

    await store.step(1, 1)

    expect(names(store)).toEqual(['Emergency fund', 'Holiday', 'New car'])
    expect(toasts.show).toHaveBeenCalledWith(expect.objectContaining({ status: 'critical' }))
  })

  it('test_a_move_that_changes_nothing_sends_nothing', async () => {
    const store = setup()
    await settle()

    await store.step(1, -1)
    await store.move(1, 1)

    expect(api.reorder).not.toHaveBeenCalled()
  })
})
