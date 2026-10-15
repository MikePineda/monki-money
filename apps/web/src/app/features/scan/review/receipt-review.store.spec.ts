import { TestBed } from '@angular/core/testing'
import type { Mock } from 'vitest'
import { WINDOW } from '../../../core/platform/window.token'
import { ToastStore } from '../../../core/ui/toast.store'
import { todayIn } from '../../../domain/month'
import {
  aReceipt,
  receiptsApiMock,
  scanTestingProviders,
  type ReceiptsApiMock,
} from '../../../../testing/scan-testing'
import { networkError, validationError } from '../../../../testing/session-fixtures'
import { ReceiptReviewStore } from './receipt-review.store'

describe('ReceiptReviewStore', () => {
  let api: ReceiptsApiMock
  let months: { invalidate: Mock }
  let toasts: { show: ReturnType<typeof vi.fn> }
  let storage: Map<string, string>
  let vibrate: ReturnType<typeof vi.fn>

  function setup(stored: Record<string, string> = {}) {
    api = receiptsApiMock()
    months = { invalidate: vi.fn() }
    toasts = { show: vi.fn(() => 1) }
    storage = new Map(Object.entries(stored))
    vibrate = vi.fn()
    const view = {
      navigator: { onLine: true, vibrate },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    }
    TestBed.configureTestingModule({
      providers: [
        ReceiptReviewStore,
        ...scanTestingProviders({ api, months }),
        { provide: ToastStore, useValue: toasts },
        { provide: WINDOW, useValue: view },
      ],
    })
    return TestBed.inject(ReceiptReviewStore)
  }

  it('test_the_draft_opens_as_an_expense_with_the_receipt_values_paid_by_you', async () => {
    const store = setup()

    await store.start(aReceipt())

    expect(store.entry()).toEqual({
      kind: 'expense',
      amountCents: 2345,
      accountId: 1,
      paidByUserId: 1,
      categoryId: 20,
      date: '2026-09-14',
      payee: 'Corner Grocer',
      description: '',
      isPrivate: false,
      tags: [],
    })
    expect(store.splitByLines()).toBe(false)
  })

  it('test_the_account_is_the_one_you_last_used_on_this_device', async () => {
    const store = setup({ 'qa:account:1': '2' })

    await store.start(aReceipt())

    expect(store.entry().accountId).toBe(2)
  })

  it('test_missing_fields_fall_back_to_today_no_payee_and_no_category', async () => {
    const store = setup()

    await store.start(
      aReceipt({ merchant: null, date: null, categoryId: null, categorySlug: null })
    )

    expect(store.entry().payee).toBe('')
    expect(store.entry().date).toBe(todayIn('Australia/Brisbane'))
    expect(store.entry().categoryId).toBeNull()
  })

  it('test_a_suggested_category_the_household_does_not_offer_is_dropped', async () => {
    const store = setup()

    await store.start(aReceipt({ categoryId: 30, categorySlug: 'salary' }))

    expect(store.entry().categoryId).toBeNull()
  })

  it('test_the_confidence_hint_follows_the_model_confidence', async () => {
    const store = setup()

    await store.start(aReceipt({ confidence: 0.4 }))

    expect(store.confidence()).toBe('low')
  })

  it('test_splitting_by_lines_needs_two_lines_and_gives_each_the_receipt_category', async () => {
    const store = setup()
    await store.start(aReceipt({ items: [{ description: 'One', amountCents: 2345, quantity: 1 }] }))
    expect(store.canSplit()).toBe(false)
    store.toggleSplit(true)
    expect(store.splitByLines()).toBe(false)

    await store.start(aReceipt())
    store.toggleSplit(true)
    expect(store.splitByLines()).toBe(true)
    expect(store.lines().map((line) => line.categoryId)).toEqual([20, 20, 20])
  })

  it('test_lines_without_a_category_take_the_one_picked_on_the_form', async () => {
    const store = setup()
    await store.start(aReceipt({ categoryId: null, categorySlug: null }))
    store.entry.update((entry) => ({ ...entry, categoryId: 11 }))

    store.toggleSplit(true)

    expect(store.lines().map((line) => line.categoryId)).toEqual([11, 11, 11])
  })

  it('test_selected_lines_can_be_merged_dropped_or_given_a_category', async () => {
    const store = setup()
    await store.start(aReceipt())
    store.toggleSplit(true)

    store.selection.set(new Set([1, 3]))
    store.mergeSelected()
    expect(store.lines().map((line) => [line.description, line.amountCents])).toEqual([
      ['Bananas 1kg + Sourdough loaf', 690],
      ['Coffee beans 500g', 1655],
    ])
    expect(store.selection().size).toBe(0)

    store.selection.set(new Set([2]))
    store.categorizeSelected(11)
    expect(store.lines()[1]?.categoryId).toBe(11)

    store.dropLine(1)
    expect(store.lines().map((line) => line.id)).toEqual([2])
    expect(store.issues()).toContain('tooFewLines')
  })

  it('test_the_last_line_absorbs_the_difference_and_the_hint_says_how_much', async () => {
    const store = setup()
    await store.start(aReceipt({ totalCents: 2340 }))
    store.toggleSplit(true)

    expect(store.settled().map((line) => line.amountCents)).toEqual([390, 1655, 295])
    expect(store.differenceCents()).toBe(-5)
    expect(store.canSave()).toBe(true)
  })

  it('test_saving_posts_a_receipt_expense_with_a_client_id', async () => {
    const store = setup()
    await store.start(aReceipt())

    await expect(store.save()).resolves.toBe(true)

    expect(api.save).toHaveBeenCalledWith({
      clientId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kind: 'expense',
      accountId: 1,
      date: '2026-09-14',
      amountCents: 2345,
      categoryId: 20,
      payee: 'Corner Grocer',
      description: null,
      paidByUserId: 1,
      isPrivate: false,
      tags: [],
      source: 'receipt',
    })
  })

  it('test_saving_split_by_lines_sends_one_split_per_line_and_no_single_category', async () => {
    const store = setup()
    await store.start(aReceipt())
    store.toggleSplit(true)
    store.selection.set(new Set([2]))
    store.categorizeSelected(11)

    await store.save()

    const body = api.save.mock.calls[0]?.[0] as Record<string, unknown>
    expect(body).not.toHaveProperty('categoryId')
    expect(body['splits']).toEqual([
      { categoryId: 20, amountCents: 390, memo: 'Bananas 1kg' },
      { categoryId: 11, amountCents: 1655, memo: 'Coffee beans 500g' },
      { categoryId: 20, amountCents: 300, memo: 'Sourdough loaf' },
    ])
  })

  it('test_after_saving_the_month_reloads_the_account_is_remembered_and_a_toast_confirms', async () => {
    const store = setup()
    await store.start(aReceipt())

    await store.save()

    expect(months.invalidate).toHaveBeenCalledWith('2026-09')
    expect(storage.get('qa:account:1')).toBe('1')
    expect(vibrate).toHaveBeenCalledWith(10)
    expect(toasts.show).toHaveBeenCalledWith({ messageKey: 'scan.toast.saved' })
  })

  it('test_a_422_goes_under_the_fields_and_keeps_the_draft', async () => {
    const store = setup()
    await store.start(aReceipt())
    api.save.mockRejectedValueOnce(validationError({ date: 'The date is too far back' }))

    await expect(store.save()).resolves.toBe(false)

    expect(store.fieldErrors()).toEqual({ date: 'The date is too far back' })
    expect(store.entry().payee).toBe('Corner Grocer')
  })

  it('test_offline_keeps_the_draft_says_so_and_a_retry_reuses_the_client_id', async () => {
    const store = setup()
    await store.start(aReceipt())
    api.save.mockRejectedValueOnce(networkError())

    await expect(store.save()).resolves.toBe(false)
    expect(toasts.show).toHaveBeenCalledWith({
      messageKey: 'scan.review.offline',
      status: 'critical',
    })

    await store.save()
    const [first, second] = api.save.mock.calls.map(
      (call) => (call[0] as { clientId: string }).clientId
    )
    expect(second).toBe(first)
  })

  it('test_nothing_is_sent_while_the_draft_cannot_be_saved', async () => {
    const store = setup()
    await store.start(aReceipt({ totalCents: null, items: [] }))

    expect(store.canSave()).toBe(false)
    await expect(store.save()).resolves.toBe(false)
    expect(api.save).not.toHaveBeenCalled()
  })
})
