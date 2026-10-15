import { Injectable, computed, inject, resource, signal } from '@angular/core'
import type { MerchantRule } from '../../core/api/api-types'
import { failureMessage } from '../../core/api/error-messages'
import { toApiError } from '../../core/api/http-errors'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import { RulesApi } from './data-access/rules.api'

/**
 * State of the rules screen `/settings/rules`: the household's merchant
 * rules (highest priority first), deleting one (optimistic, restored if the
 * API refuses) and applying one to the transactions still in review, which
 * reports how many it categorized. Provided by the page.
 */
@Injectable()
export class RulesStore {
  private readonly api = inject(RulesApi)
  private readonly toasts = inject(ToastStore)
  private readonly months = inject(MonthStore)
  readonly directory = inject(HouseholdDirectory)

  readonly list = resource({ loader: () => this.api.list() })
  /** Rules removed on screen while their delete is on its way. */
  private readonly removed = signal<ReadonlySet<number>>(new Set())
  /** The rule being applied (its row shows a spinner). */
  readonly applying = signal<number | null>(null)

  readonly rules = computed<MerchantRule[]>(() => {
    const removed = this.removed()
    return (this.list.hasValue() ? this.list.value() : []).filter((rule) => !removed.has(rule.id))
  })
  readonly firstLoad = computed(() => !this.list.hasValue() && this.list.isLoading())
  readonly failed = computed(() => this.list.status() === 'error')

  constructor() {
    void this.directory.load().catch(() => undefined)
  }

  retry(): void {
    this.list.reload()
  }

  async remove(rule: MerchantRule): Promise<boolean> {
    this.removed.update((current) => new Set([...current, rule.id]))
    try {
      await this.api.remove(rule.id)
      this.list.value.update((rules) => (rules ?? []).filter((item) => item.id !== rule.id))
      /** t(rules.toast.deleted) */
      this.toasts.show({ messageKey: 'rules.toast.deleted' })
      return true
    } catch (error) {
      this.fail(error)
      return false
    } finally {
      this.removed.update((current) => new Set([...current].filter((id) => id !== rule.id)))
    }
  }

  /** Resolves with how many transactions the rule categorized, or null when it failed. */
  async apply(rule: MerchantRule): Promise<number | null> {
    if (this.applying() !== null) {
      return null
    }
    this.applying.set(rule.id)
    try {
      const updated = await this.api.apply(rule.id)
      if (updated > 0) {
        // Categories moved in months this screen cannot know: reload what is on screen.
        this.months.invalidate(this.months.selectedMonth())
      }
      /** t(rules.toast.applied) */
      this.toasts.show({
        messageKey: 'rules.toast.applied',
        params: { count: updated },
        status: 'good',
      })
      this.list.reload()
      return updated
    } catch (error) {
      this.fail(error)
      return null
    } finally {
      this.applying.set(null)
    }
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
