import { Component, computed, inject, input, resource, signal, untracked } from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { failureMessage } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { HouseholdDirectory } from '../../../core/household/household-directory.store'
import { MembersStore } from '../../../core/household/members.store'
import { MonthStore } from '../../../core/month/month.store'
import { newClientId } from '../../../core/platform/client-id'
import { CLOCK } from '../../../core/platform/clock.token'
import { HOUSEHOLD_TIME_ZONE } from '../../../core/platform/time-zone.token'
import { ToastStore } from '../../../core/ui/toast.store'
import { ownerChoiceOf } from '../../../domain/account-presets'
import { todayIn } from '../../../domain/month'
import { emptyPayslipDraft, payslipPayload, type PayslipDraft } from '../../../domain/payslip-draft'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { PayslipsApi } from '../data-access/payslips.api'
import { providePayslipsScope } from '../payslips.scope'
import { PayslipFormComponent } from '../ui/payslip-form.component'

/** Default categories of the deductions (the shared taxonomy's slugs; renamed ones keep them). */
const TAX_SLUG = 'taxes'
const FEE_SLUG = 'bank-fees'

/**
 * New payslip `/settings/accounts/:accountId/payslips/new`: the payslip
 * form over the account's candidate transfers and the household's expense
 * categories. The person defaults to the account's owner, the tax and fee
 * lines to the taxes and bank-fees categories. Saving says so, marks the
 * month as changed (its income and spending move) and goes back to the
 * list; a 422 shows under its fields, anything else is a toast and the
 * form keeps what was typed.
 */
@Component({
  selector: 'app-payslip-new-page',
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    IconButtonComponent,
    PayslipFormComponent,
    RouterLink,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [providePayslipsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-1 pl-1">
      <a appIconButton icon="arrow-left" routerLink=".." [label]="'payslips.back' | transloco"></a>
      <div class="flex min-w-0 flex-1 flex-col">
        <h1 class="truncate text-heading text-ink-1">
          {{ 'payslips.form.newTitle' | transloco }}
        </h1>
        @if (account(); as current) {
          <span class="truncate text-caption text-ink-3">{{ current.name }}</span>
        }
      </div>
    </header>

    @switch (status()) {
      @case ('error') {
        <app-empty-state
          data-testid="payslips.new.error"
          icon="wifi-off"
          [title]="'payslips.error.title' | transloco"
          [body]="'payslips.error.body' | transloco"
        >
          <button appButton type="button" variant="secondary" icon="refresh-cw" (click)="retry()">
            {{ 'payslips.error.retry' | transloco }}
          </button>
        </app-empty-state>
      }
      @case ('ready') {
        <app-payslip-form
          class="px-4 pt-2 pb-8"
          data-testid="payslips.new"
          [initial]="initial()!"
          [candidates]="candidates.value() ?? []"
          [accounts]="directory.accounts()"
          [accountId]="id()"
          [categories]="expenseCategories()"
          [partnerName]="partnerName()"
          [busy]="busy()"
          [serverErrors]="errors()"
          (submitted)="save($event)"
        />
      }
      @default {
        <div class="flex flex-col gap-4 px-4 pt-2" role="status">
          <span class="sr-only">{{ 'payslips.loading' | transloco }}</span>
          <app-skeleton height="160px" />
          <app-skeleton height="56px" />
          <app-skeleton height="56px" />
        </div>
      }
    }
  `,
})
export default class PayslipNewPage {
  /** From the route (`:accountId`). */
  readonly accountId = input.required<string>()

  protected readonly directory = inject(HouseholdDirectory)
  private readonly members = inject(MembersStore)
  private readonly api = inject(PayslipsApi)
  private readonly month = inject(MonthStore)
  private readonly toasts = inject(ToastStore)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly timeZone = inject(HOUSEHOLD_TIME_ZONE)
  private readonly clock = inject(CLOCK)

  private readonly attempt = signal(0)
  private readonly directoryReady = resource({
    params: () => ({ attempt: this.attempt() }),
    // Fresh accounts and categories (one may have been added since the app
    // started); nothing reloads them afterwards, so the draft never resets.
    loader: async () => {
      await this.directory.load(true)
      return true
    },
  })
  protected readonly candidates = resource({
    params: () => ({ accountId: this.id(), attempt: this.attempt() }),
    loader: ({ params }) => this.api.candidates(params.accountId),
  })

  protected readonly busy = signal(false)
  protected readonly errors = signal<Record<string, string>>({})

  protected readonly id = computed(() => Number(this.accountId()))
  protected readonly account = computed(() => this.directory.account(this.id()))
  protected readonly partnerName = computed(() => this.members.partner()?.name ?? null)
  protected readonly expenseCategories = computed(() => this.directory.categoriesOf('expense'))

  protected readonly status = computed<'loading' | 'ready' | 'error'>(() => {
    if (this.directoryReady.status() === 'error' || this.candidates.status() === 'error') {
      return 'error'
    }
    return this.directoryReady.hasValue() && this.candidates.hasValue() && this.initial()
      ? 'ready'
      : 'loading'
  })

  /**
   * The draft the form starts from, built once the account and categories
   * are known. Only the directory's readiness is tracked: a later reload of
   * the household's accounts or categories must never rebuild it, or the
   * form's `linkedSignal` would wipe what was typed.
   */
  protected readonly initial = computed<PayslipDraft | null>(() => {
    if (!this.directoryReady.hasValue()) {
      return null
    }
    return untracked(() => this.startingDraft())
  })

  protected retry(): void {
    this.attempt.update((value) => value + 1)
  }

  private startingDraft(): PayslipDraft {
    const account = this.account()
    const youId = this.directory.youId() ?? 0
    const bySlug = (slug: string) =>
      this.expenseCategories().find((entry) => entry.category.slug === slug)?.category.id ?? null
    return emptyPayslipDraft({
      clientId: newClientId(),
      date: todayIn(this.timeZone(), this.clock()),
      person: account ? ownerChoiceOf(account.ownerUserId, youId) : 'you',
      taxCategoryId: bySlug(TAX_SLUG),
      feeCategoryId: bySlug(FEE_SLUG),
    })
  }

  protected async save(draft: PayslipDraft): Promise<void> {
    if (this.busy()) {
      return
    }
    this.busy.set(true)
    this.errors.set({})
    try {
      const payslip = await this.api.create(
        payslipPayload(draft, this.id(), {
          youId: this.directory.youId() ?? 0,
          partnerId: this.members.partner()?.userId ?? null,
        })
      )
      this.month.invalidateDate(payslip.date)
      this.toasts.show({ messageKey: 'payslips.saved', status: 'good' })
      await this.router.navigate(['..'], { relativeTo: this.route, replaceUrl: true })
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation' && Object.keys(failure.fields).length > 0) {
        this.errors.set(failure.fields)
      } else if (failure.kind !== 'unauthorized') {
        const message = failureMessage(failure)
        this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
      }
    } finally {
      this.busy.set(false)
    }
  }
}
