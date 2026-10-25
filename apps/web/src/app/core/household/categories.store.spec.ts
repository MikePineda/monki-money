import { TestBed } from '@angular/core/testing'
import { aCategoryTree } from '../../../testing/ledger-fixtures'
import type { CategoryTree } from '../../domain/category-tree'
import { SessionStore } from '../auth/session.store'
import { CategoriesApi } from './categories.api'
import { CategoriesStore } from './categories.store'

describe('CategoriesStore', () => {
  let api: { tree: ReturnType<typeof vi.fn> }
  let clearHooks: (() => void)[]

  function setup(): CategoriesStore {
    api = { tree: vi.fn(async () => aCategoryTree()) }
    clearHooks = []
    TestBed.configureTestingModule({
      providers: [
        { provide: CategoriesApi, useValue: api },
        {
          provide: SessionStore,
          useValue: { onClear: (hook: () => void) => clearHooks.push(hook) },
        },
      ],
    })
    return TestBed.inject(CategoriesStore)
  }

  function logout(): void {
    clearHooks.forEach((hook) => hook())
  }

  it('test_loads_the_tree_once_and_shares_the_request', async () => {
    const store = setup()

    await Promise.all([store.load(), store.load()])
    await store.load()

    expect(api.tree).toHaveBeenCalledTimes(1)
    expect(store.isLoaded()).toBe(true)
    expect(store.tree()).toEqual(aCategoryTree())
  })

  it('test_a_load_in_flight_at_logout_never_refills_the_previous_households_categories', async () => {
    const store = setup()
    let answer: (tree: CategoryTree) => void = () => undefined
    api.tree.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    const inFlight = store.load()

    logout()
    answer([{ ...aCategoryTree()[0]!, name: 'Previous household' }])
    await inFlight

    expect(store.tree()).toEqual([])
    expect(store.isLoaded()).toBe(false)
    await store.load()
    expect(api.tree).toHaveBeenCalledTimes(2)
    expect(store.tree()).toEqual(aCategoryTree())
  })

  it('test_a_request_from_before_logout_does_not_drop_the_one_that_replaced_it', async () => {
    const store = setup()
    let answerOld: (tree: CategoryTree) => void = () => undefined
    let answerNew: (tree: CategoryTree) => void = () => undefined
    api.tree
      .mockImplementationOnce(() => new Promise((resolve) => (answerOld = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (answerNew = resolve)))
    const old = store.load()
    logout()
    const fresh = store.load()

    answerOld([])
    await old
    // Still waiting for the new session's answer: another call shares it.
    const joined = store.load()
    answerNew(aCategoryTree())
    await Promise.all([fresh, joined])

    expect(api.tree).toHaveBeenCalledTimes(2)
    expect(store.tree()).toEqual(aCategoryTree())
  })

  it('test_logout_forgets_the_tree', async () => {
    const store = setup()
    await store.load()

    logout()

    expect(store.tree()).toEqual([])
    expect(store.isLoaded()).toBe(false)
  })
})
