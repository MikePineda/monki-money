import { Component, computed, effect, inject, input } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import type { Payslip } from '../../../core/api/api-types'
import { HouseholdDirectory } from '../../../core/household/household-directory.store'
import { MembersStore } from '../../../core/household/members.store'
import { formatWeekdayDate } from '../../../domain/dates'
import { formatMoney } from '../../../domain/money'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { openConfirmSheet } from '../../../shared/ui/confirm-sheet/confirm-sheet.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { PayslipsStore } from '../payslips.store'
import { providePayslipsScope } from '../payslips.scope'
import { PayslipCardComponent, type PayslipCardView } from '../ui/payslip-card.component'

/**
 * Keys read from TypeScript (relative to the `payslips` scope), declared
 * for transloco-keys-manager:
 * t(payslips.card.you, payslips.card.joint, payslips.delete.title, payslips.delete.body)
 * t(payslips.delete.confirm, payslips.delete.cancel, payslips.deleted, payslips.saved)
 */
const WORD_KEYS = [
  'card.you',
  'card.joint',
  'delete.title',
  'delete.body',
  'delete.confirm',
  'delete.cancel',
]

/**
 * An account's payslips `/settings/accounts/:accountId/payslips` (from the
 * Payslips row of a wallet account): newest first, each with its gross,
 * deductions and net, and "New payslip". Deleting asks first. Editing is
 * delete and record again, and the page says so.
 */
@Component({
  selector: 'app-payslips-page',
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    IconButtonComponent,
    PayslipCardComponent,
    RouterLink,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [PayslipsStore, providePayslipsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-1 pl-1">
      <a
        appIconButton
        icon="arrow-left"
        routerLink="/settings/accounts"
        [label]="'payslips.back' | transloco"
      ></a>
      <div class="flex min-w-0 flex-1 flex-col">
        <h1 class="truncate text-heading text-ink-1">{{ 'payslips.title' | transloco }}</h1>
        @if (accountName(); as name) {
          <span class="truncate text-caption text-ink-3" data-testid="payslips.account">{{
            name
          }}</span>
        }
      </div>
      <a
        appIconButton
        icon="plus"
        routerLink="new"
        data-testid="payslips.add"
        [label]="'payslips.add' | transloco"
      ></a>
    </header>

    <div class="flex flex-col gap-3 px-gutter pt-2 pb-8" data-testid="payslips.page">
      @switch (store.status()) {
        @case ('error') {
          <app-empty-state
            data-testid="payslips.error"
            icon="wifi-off"
            [title]="'payslips.error.title' | transloco"
            [body]="'payslips.error.body' | transloco"
          >
            <button
              appButton
              type="button"
              variant="secondary"
              icon="refresh-cw"
              (click)="store.retry()"
            >
              {{ 'payslips.error.retry' | transloco }}
            </button>
          </app-empty-state>
        }
        @case ('ready') {
          @for (view of views(); track view.id) {
            <app-payslip-card
              [view]="view"
              [busy]="store.busy()"
              (deleteRequested)="confirmDelete(view.id)"
            />
          } @empty {
            <app-empty-state
              data-testid="payslips.empty"
              icon="receipt"
              [title]="'payslips.empty.title' | transloco"
              [body]="'payslips.empty.body' | transloco"
            >
              <a appButton icon="plus" routerLink="new" data-testid="payslips.empty.add">{{
                'payslips.empty.action' | transloco
              }}</a>
            </app-empty-state>
          }
          @if (views().length > 0) {
            <p class="text-caption text-ink-3">{{ 'payslips.editHint' | transloco }}</p>
          }
        }
        @default {
          <div class="flex flex-col gap-3" data-testid="payslips.loading" role="status">
            <span class="sr-only">{{ 'payslips.loading' | transloco }}</span>
            <app-skeleton height="148px" />
            <app-skeleton height="148px" />
          </div>
        }
      }
    </div>
  `,
})
export default class PayslipsPage {
  /** From the route (`:accountId`). */
  readonly accountId = input.required<string>()

  protected readonly store = inject(PayslipsStore)
  private readonly directory = inject(HouseholdDirectory)
  private readonly members = inject(MembersStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly locale = inject(APP_LOCALE)
  private readonly words = translateSignal(WORD_KEYS)

  protected readonly accountName = computed(
    () => this.directory.account(Number(this.accountId()))?.name ?? ''
  )
  protected readonly views = computed(() => this.store.payslips().map((item) => this.view(item)))

  constructor() {
    effect(() => this.store.accountId.set(Number(this.accountId())))
    void this.directory.load().catch(() => undefined)
  }

  protected confirmDelete(payslipId: number): void {
    const payslip = this.store.payslips().find((item) => item.id === payslipId)
    if (!payslip) {
      return
    }
    const [, , title = '', body = '', confirmLabel = '', cancelLabel = ''] = this.words()
    openConfirmSheet(this.sheets, {
      title,
      body,
      confirmLabel,
      cancelLabel,
      destructive: true,
    }).subscribe((confirmed) => {
      if (confirmed) {
        void this.store.remove(payslip)
      }
    })
  }

  private view(payslip: Payslip): PayslipCardView {
    const locale = this.locale()
    const money = (cents: number) => formatMoney(cents, locale)
    return {
      id: payslip.id,
      date: formatWeekdayDate(payslip.date, locale, { withYear: true }),
      person: this.personWord(payslip.userId),
      gross: money(payslip.grossCents),
      deductions: money(payslip.deductionsCents),
      net: money(payslip.netCents),
      toAccount: payslip.transfer
        ? (this.directory.account(payslip.transfer.toAccountId)?.name ?? '')
        : null,
      lines: payslip.lines
        .filter((line) => line.kind === 'expense')
        .map((line) => ({
          name: this.directory.category(line.categoryId)?.category.name ?? null,
          masked: line.isMasked,
          memo: line.memo,
          amount: money(line.amountCents),
        })),
    }
  }

  private personWord(userId: number | null): string {
    const [you = '', joint = ''] = this.words()
    if (userId === null) {
      return joint
    }
    const person = this.members.find(userId)
    return person?.isYou ? you : (person?.name ?? '')
  }
}
