import { TestBed } from '@angular/core/testing'
import { aCategoryTree } from '../../../testing/ledger-fixtures'
import { httpError } from '../../../testing/session-fixtures'
import { SessionStore } from '../../core/auth/session.store'
import { CategoriesApi } from '../../core/household/categories.api'
import { CategoriesStore } from '../../core/household/categories.store'
import { ToastStore } from '../../core/ui/toast.store'
import { CategoriesPageStore } from './categories.store'

describe('CategoriesPageStore', () => {
  let api: Record<
    'tree' | 'create' | 'update' | 'remove' | 'reorder' | 'reorderGroups',
    ReturnType<typeof vi.fn>
  >

  async function setup() {
    api = {
      tree: vi.fn(async () => aCategoryTree()),
      create: vi.fn(),
      update: vi.fn(async (id: number, body: object) => ({
        ...aCategoryTree()
          .flatMap((group) => group.categories)
          .find((category) => category.id === id),
        ...body,
      })),
      remove: vi.fn(async () => undefined),
      reorder: vi.fn(async () => undefined),
      reorderGroups: vi.fn(async () => undefined),
    }
    TestBed.configureTestingModule({
      providers: [
        CategoriesPageStore,
        { provide: CategoriesApi, useValue: api },
        { provide: SessionStore, useValue: { onClear: () => undefined } },
      ],
    })
    const store = TestBed.inject(CategoriesPageStore)
    await store.load()
    return store
  }

  const names = (store: CategoriesPageStore, groupId: number) =>
    store
      .active()
      .find((group) => group.id === groupId)
      ?.categories.map((category) => category.name)

  it('test_moving_down_reorders_the_group_and_persists_the_full_order', async () => {
    const store = await setup()

    await store.step(10, 1)

    expect(names(store, 1)).toEqual(['Utilities', 'Rent'])
    expect(api.reorder).toHaveBeenCalledWith([11, 10])
    expect(api.update).not.toHaveBeenCalled()
  })

  it('test_moving_into_another_group_changes_the_group_before_reordering_it', async () => {
    const store = await setup()

    await store.move(20, 1, 0)

    expect(api.update).toHaveBeenCalledWith(20, { categoryGroupId: 1 })
    expect(api.reorder).toHaveBeenCalledWith([20, 10, 11])
    expect(api.update.mock.invocationCallOrder[0]).toBeLessThan(
      api.reorder.mock.invocationCallOrder[0] ?? 0
    )
  })

  it('test_a_failed_reorder_rolls_back_and_says_so', async () => {
    const store = await setup()
    api.reorder.mockRejectedValue(httpError(500))

    await store.step(10, 1)

    expect(names(store, 1)).toEqual(['Rent', 'Utilities'])
    expect(TestBed.inject(ToastStore).current()?.status).toBe('critical')
  })

  it('test_groups_reorder_with_their_ids', async () => {
    const store = await setup()

    await store.stepGroup(2, -1)

    expect(store.active().map((group) => group.id)).toEqual([2, 1, 3])
    expect(api.reorderGroups).toHaveBeenCalledWith([2, 1, 3])
  })

  it('test_archive_hides_the_category_everywhere_and_undo_restores_it', async () => {
    const store = await setup()

    await store.archive(11)

    expect(api.update).toHaveBeenCalledWith(11, { isHidden: true })
    expect(names(store, 1)).toEqual(['Rent'])
    expect(store.archived().map((item) => item.category.id)).toEqual([11])
    expect(
      TestBed.inject(CategoriesStore)
        .options()
        .map((option) => option.id)
    ).not.toContain(11)

    TestBed.inject(ToastStore).runAction()
    await vi.waitFor(() => expect(api.update).toHaveBeenLastCalledWith(11, { isHidden: false }))
    expect(names(store, 1)).toEqual(['Rent', 'Utilities'])
  })

  it('test_deleting_a_category_in_use_asks_for_a_replacement', async () => {
    const store = await setup()
    api.remove.mockRejectedValueOnce(httpError(409, { code: 'E_CATEGORY_IN_USE', message: 'x' }))

    expect(await store.remove(11)).toBe('inUse')
    expect(store.archived()).toEqual([])

    expect(await store.remove(11, 10)).toBe('deleted')
    expect(api.remove).toHaveBeenLastCalledWith(11, 10)
    expect(names(store, 1)).toEqual(['Rent'])
  })

  it('test_rename_shows_at_once_and_keeps_the_server_answer', async () => {
    const store = await setup()

    await store.rename(10, '  Mortgage ')

    expect(api.update).toHaveBeenCalledWith(10, { name: 'Mortgage' })
    expect(names(store, 1)).toEqual(['Mortgage', 'Utilities'])
  })

  it('test_create_appends_the_new_category_to_its_group', async () => {
    const store = await setup()
    api.create.mockResolvedValue({
      id: 99,
      groupId: 2,
      name: 'Bakery',
      slug: 'bakery',
      icon: null,
      isHidden: false,
      isSystem: false,
    })

    await store.create(2, 'Bakery')

    expect(api.create).toHaveBeenCalledWith({ categoryGroupId: 2, name: 'Bakery' })
    expect(names(store, 2)).toEqual(['Groceries', 'Bakery'])
  })
})
