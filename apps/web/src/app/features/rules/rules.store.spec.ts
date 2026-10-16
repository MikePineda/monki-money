import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { Mock } from 'vitest'
import { aRule } from '../../../testing/import-fixtures'
import { httpError } from '../../../testing/session-fixtures'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import { RulesApi } from './data-access/rules.api'
import { EMPTY_RULE_DRAFT, draftFromRule } from './rule-draft'
import { RulesStore } from './rules.store'

describe('RulesStore', () => {
  let api: Record<'list' | 'create' | 'update' | 'remove' | 'apply', Mock>
  let months: { invalidate: Mock; selectedMonth: () => string }

  async function setup() {
    api = {
      list: vi.fn(async () => [aRule({ id: 1 }), aRule({ id: 2, pattern: 'bean there cafe' })]),
      create: vi.fn(async (body: Record<string, unknown>) =>
        aRule({ id: 7, origin: 'user', hitCount: 0, ...body })
      ),
      update: vi.fn(async (id: number, body: Record<string, unknown>) =>
        aRule({ id, origin: 'user', ...body })
      ),
      remove: vi.fn(async () => undefined),
      apply: vi.fn(async () => 3),
    }
    months = { invalidate: vi.fn(), selectedMonth: () => '2026-10' }
    TestBed.configureTestingModule({
      providers: [
        RulesStore,
        { provide: RulesApi, useValue: api },
        { provide: MonthStore, useValue: months },
        { provide: HouseholdDirectory, useValue: { load: vi.fn(async () => undefined) } },
      ],
    })
    const store = TestBed.inject(RulesStore)
    await TestBed.inject(ApplicationRef).whenStable()
    return store
  }

  it('test_loads_the_household_rules', async () => {
    const store = await setup()

    expect(store.rules().map((rule) => rule.id)).toEqual([1, 2])
    expect(store.firstLoad()).toBe(false)
  })

  it('test_a_deleted_rule_leaves_the_list_and_says_so', async () => {
    const store = await setup()

    await expect(store.remove(aRule({ id: 1 }))).resolves.toBe(true)

    expect(api.remove).toHaveBeenCalledWith(1)
    expect(store.rules().map((rule) => rule.id)).toEqual([2])
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('rules.toast.deleted')
  })

  it('test_a_refused_delete_puts_the_rule_back', async () => {
    const store = await setup()
    api.remove.mockRejectedValueOnce(httpError(500))

    await expect(store.remove(aRule({ id: 1 }))).resolves.toBe(false)

    expect(store.rules().map((rule) => rule.id)).toEqual([1, 2])
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('errors.server')
  })

  it('test_applying_a_rule_reports_how_many_movements_it_categorised', async () => {
    const store = await setup()

    await expect(store.apply(aRule({ id: 2 }))).resolves.toBe(3)

    expect(api.apply).toHaveBeenCalledWith(2)
    expect(TestBed.inject(ToastStore).current()).toMatchObject({
      messageKey: 'rules.toast.applied',
      params: { count: 3 },
    })
    expect(months.invalidate).toHaveBeenCalledWith('2026-10')
    expect(store.applying()).toBeNull()
  })

  it('test_a_rule_that_matched_nothing_leaves_the_months_alone', async () => {
    const store = await setup()
    api.apply.mockResolvedValueOnce(0)

    await store.apply(aRule({ id: 2 }))

    expect(months.invalidate).not.toHaveBeenCalled()
  })

  it('test_a_new_rule_goes_first_in_the_list', async () => {
    const store = await setup()

    const saved = await store.save(null, {
      ...EMPTY_RULE_DRAFT,
      matchType: 'contains',
      pattern: ' FRESHCO ',
      categoryId: 20,
    })

    expect(api.create).toHaveBeenCalledWith({
      matchType: 'contains',
      pattern: 'FRESHCO',
      categoryId: 20,
      transferAccountId: null,
      paidByUserId: null,
      payeeOverride: null,
      priority: 0,
    })
    expect(saved.id).toBe(7)
    expect(store.rules().map((rule) => rule.id)).toEqual([7, 1, 2])
  })

  it('test_editing_a_rule_updates_the_row_in_place', async () => {
    const store = await setup()
    const rule = aRule({ id: 1 })

    await store.save(rule, { ...draftFromRule(rule), categoryId: 10 })

    expect(api.update).toHaveBeenCalledWith(1, { categoryId: 10 })
    expect(store.rules().map((item) => [item.id, item.categoryId])).toEqual([
      [1, 10],
      [2, 20],
    ])
  })

  it('test_a_saved_rule_offers_to_apply_it_to_the_movements_in_review', async () => {
    const store = await setup()
    const toasts = TestBed.inject(ToastStore)

    await store.save(null, { ...EMPTY_RULE_DRAFT, pattern: 'freshco', categoryId: 20 })

    expect(toasts.current()).toMatchObject({
      messageKey: 'rules.toast.savedApply',
      status: 'good',
      action: { labelKey: 'rules.toast.apply' },
    })
    toasts.runAction()
    await vi.waitFor(() => expect(api.apply).toHaveBeenCalledWith(7))
    await vi.waitFor(() => expect(months.invalidate).toHaveBeenCalledWith('2026-10'))
  })

  it('test_a_transfer_rule_is_saved_without_offering_to_apply_it', async () => {
    const store = await setup()

    await store.save(null, {
      ...EMPTY_RULE_DRAFT,
      pattern: 'linked acc',
      target: 'transfer',
      transferAccountId: 2,
    })

    expect(TestBed.inject(ToastStore).current()).toMatchObject({ messageKey: 'rules.toast.saved' })
    expect(TestBed.inject(ToastStore).current()?.action).toBeUndefined()
  })

  it('test_saving_a_rule_leaves_the_months_alone', async () => {
    const store = await setup()

    await store.save(null, { ...EMPTY_RULE_DRAFT, pattern: 'freshco', categoryId: 20 })

    // A rule changes no movement until it is applied or an import uses it.
    expect(months.invalidate).not.toHaveBeenCalled()
  })

  it('test_a_refused_save_leaves_the_list_as_it_was', async () => {
    const store = await setup()
    api.create.mockRejectedValueOnce(httpError(422, { errors: [] }))

    await expect(
      store.save(null, { ...EMPTY_RULE_DRAFT, pattern: '(', matchType: 'regex', categoryId: 20 })
    ).rejects.toBeTruthy()

    expect(store.rules().map((rule) => rule.id)).toEqual([1, 2])
    expect(TestBed.inject(ToastStore).current()).toBeNull()
  })
})
