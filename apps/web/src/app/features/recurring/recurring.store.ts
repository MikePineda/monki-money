import { Injectable, computed, inject, resource, signal } from '@angular/core'
import type { RecurringItem } from '../../core/api/api-types'
import { failureMessage } from '../../core/api/error-messages'
import { toApiError } from '../../core/api/http-errors'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { RecurringApi } from '../../core/ledger/recurring.api'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import {
  createBody,
  patchOf,
  type MerchantSuggestion,
  sectionsOf,
  statusAfter,
  type RecurringAction,
  type RecurringDraft,
} from '../../domain/recurring'

/**
 * Toasts after a status change, by action. Declared for transloco-keys-manager:
 * t(recurring.toast.paused, recurring.toast.resumed, recurring.toast.dismissed, recurring.toast.restored)
 */
const STATUS_TOASTS: Record<Exclude<RecurringAction, 'edit' | 'delete'>, string> = {
  pause: 'recurring.toast.paused',
  resume: 'recurring.toast.resumed',
  dismiss: 'recurring.toast.dismissed',
  restore: 'recurring.toast.restored',
}

/**
 * State of `/recurring`: the household's recurring payments by status,
 * detection on demand, adding and editing one (the sheet gets the API's
 * field messages back) and pausing, resuming, dismissing, restoring or
 * deleting one, shown at once and rolled back if the API refuses. Every change reloads
 * the current month, whose "Committed this month" card counts them.
 * Provided by the page.
 */
@Injectable()
export class RecurringStore {
  private readonly api = inject(RecurringApi)
  private readonly toasts = inject(ToastStore)
  private readonly months = inject(MonthStore)
  readonly directory = inject(HouseholdDirectory)

  readonly list = resource({ loader: () => this.api.list() })
  readonly items = computed<RecurringItem[]>(() => (this.list.hasValue() ? this.list.value() : []))
  readonly sections = computed(() => sectionsOf(this.items()))
  readonly isEmpty = computed(() => this.items().length === 0)
  readonly firstLoad = computed(() => !this.list.hasValue() && this.list.isLoading())
  readonly failed = computed(() => this.list.status() === 'error')
  /** "Detect again" is running. */
  readonly detecting = signal(false)
  /** Merchants paid lately, offered while adding an item by hand (loaded on demand). */
  readonly merchants = signal<MerchantSuggestion[]>([])

  constructor() {
    void this.directory.load().catch(() => undefined)
  }

  retry(): void {
    this.list.reload()
  }

  /** Loads the merchants to offer; without them the sheet simply offers none. */
  async loadMerchants(): Promise<void> {
    try {
      this.merchants.set(await this.api.merchants())
    } catch {
      this.merchants.set([])
    }
  }

  async detect(): Promise<void> {
    if (this.detecting()) {
      return
    }
    this.detecting.set(true)
    try {
      const { created } = await this.api.detect()
      /** t(recurring.toast.found) */
      this.toasts.show({
        messageKey: 'recurring.toast.found',
        params: { count: created },
        status: created > 0 ? 'good' : undefined,
      })
      this.list.reload()
      this.monthChanged()
    } catch (error) {
      this.fail(error)
    } finally {
      this.detecting.set(false)
    }
  }

  /**
   * Adds (`item` undefined) or edits an item, sending only what changed.
   * Resolves with null once saved, or with the API's field messages (422)
   * for the sheet to show under its fields.
   */
  async save(
    item: RecurringItem | undefined,
    draft: RecurringDraft
  ): Promise<Record<string, string> | null> {
    try {
      if (item) {
        const patch = patchOf(item, draft)
        if (Object.keys(patch).length === 0) {
          return null
        }
        await this.api.update(item.id, patch)
      } else {
        await this.api.create(createBody(draft))
      }
    } catch (error) {
      const apiError = toApiError(error)
      if (apiError.kind === 'validation' && Object.keys(apiError.fields).length > 0) {
        return apiError.fields
      }
      this.fail(error)
      return {}
    }
    /** t(recurring.toast.saved) */
    this.toasts.show({
      messageKey: 'recurring.toast.saved',
      params: { payee: draft.payee.trim() },
      status: 'good',
    })
    this.list.reload()
    this.monthChanged()
    return null
  }

  /** Pause, resume, dismiss or restore: on screen at once, rolled back if refused. */
  async act(
    item: RecurringItem,
    action: Exclude<RecurringAction, 'edit' | 'delete'>
  ): Promise<void> {
    const status = statusAfter(action)
    if (status === null) {
      return
    }
    const before = this.list.value()
    this.replace({ ...item, status })
    try {
      const saved = await this.api.update(item.id, { status })
      this.replace(saved)
      this.toasts.show({ messageKey: STATUS_TOASTS[action], params: { payee: item.payee } })
      this.monthChanged()
    } catch (error) {
      if (before) {
        this.list.value.set(before)
      }
      this.fail(error)
    }
  }

  /** Forgets an item (the page asked first): gone at once, put back if the API refuses. */
  async remove(item: RecurringItem): Promise<void> {
    const before = this.list.value()
    this.list.value.update((items) => (items ?? []).filter((entry) => entry.id !== item.id))
    try {
      await this.api.remove(item.id)
      /** t(recurring.toast.deleted) */
      this.toasts.show({ messageKey: 'recurring.toast.deleted', params: { payee: item.payee } })
      this.monthChanged()
    } catch (error) {
      if (before) {
        this.list.value.set(before)
      }
      this.fail(error)
    }
  }

  private replace(next: RecurringItem): void {
    this.list.value.update((items) =>
      (items ?? []).map((item) => (item.id === next.id ? next : item))
    )
  }

  /** The current month's "Committed this month" card counts these items. */
  private monthChanged(): void {
    this.months.invalidate(this.months.current())
  }

  private fail(error: unknown): void {
    const apiError = toApiError(error)
    if (apiError.kind === 'unauthorized') {
      return
    }
    const message = failureMessage(apiError)
    this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
  }
}
