import { Location } from '@angular/common'
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe, provideTranslocoScope, translateSignal } from '@jsverse/transloco'
import { flattenCategories } from '../../domain/category-tree'
import { formatWeekdayDate } from '../../domain/dates'
import { formatTransactionAmount } from '../../domain/money'
import { addDays } from '../../domain/month'
import { ToastOutletComponent } from '../../layouts/toast-outlet/toast-outlet.component'
import { categoryIcon } from '../../shared/icons/category-icons'
import type { CategoryTile } from '../../shared/transaction-form/category-grid.component'
import { TransactionFormComponent } from '../../shared/transaction-form/transaction-form.component'
import {
  TransferFormComponent,
  type TransferPreset,
} from '../../shared/transaction-form/transfer-form.component'
import { AmountKeypadComponent } from '../../shared/ui/amount-keypad/amount-keypad.component'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { BannerComponent } from '../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../shared/ui/button/button.component'
import { ChipComponent } from '../../shared/ui/chip/chip.component'
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../shared/ui/segmented-control/segmented-control.component'
import type { SelectOption } from '../../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component'
import { QuickAddStore, type QuickKind } from './data-access/quick-add.store'

/**
 * Scoped keys used from TypeScript. translateSignal() adds the "quickAdd."
 * prefix itself (relative keys). Declared for transloco-keys-manager:
 * t(quickAdd.who.you, quickAdd.who.joint)
 */
const PEOPLE_KEYS = ['who.you', 'who.joint']
/** t(quickAdd.kind.expense, quickAdd.kind.income, quickAdd.kind.transfer) */
const KIND_KEYS = ['kind.expense', 'kind.income', 'kind.transfer']
const KINDS: readonly QuickKind[] = ['expense', 'income', 'transfer']

/**
 * Quick add `/add` (DESIGN.md, "the sacred screen"; 3 taps ≈ 6 s). Full
 * screen, no tab bar: the keypad and the save button own the bottom edge,
 * toasts dock under the top bar. The page shows the type segment (with
 * transfer) and hosts the shared transaction or transfer form in its quick
 * shape: the amount fed by the docked keypad, the grid of the most used
 * categories (or the most used transfer routes) and the details folded
 * into one row. It opens with the defaults (QuickAddStore), honours
 * `?type=income|transfer` (the manifest shortcut uses `?type=expense`),
 * saves, clears and stays here for the next entry. "Done" goes back to
 * where the person came from (the month by default).
 */
@Component({
  selector: 'app-quick-add-page',
  imports: [
    AmountKeypadComponent,
    BannerComponent,
    ButtonComponent,
    ChipComponent,
    EmptyStateComponent,
    RouterLink,
    SegmentedControlComponent,
    SkeletonComponent,
    ToastOutletComponent,
    TransactionFormComponent,
    TransferFormComponent,
    TranslocoPipe,
  ],
  providers: [
    QuickAddStore,
    provideTranslocoScope({
      scope: 'quickAdd',
      loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
    }),
  ],
  template: `
    <div
      data-testid="quickAdd.page"
      class="mx-auto flex h-dvh w-full max-w-app flex-col bg-surface-0 pt-safe text-ink-1"
    >
      <header class="flex h-14 shrink-0 items-center justify-between gap-2 pr-4 pl-1">
        <button
          appButton
          variant="ghost"
          type="button"
          data-testid="quickAdd.done"
          (click)="done()"
        >
          {{ 'quickAdd.done' | transloco }}
        </button>
        <button
          appChip
          data-testid="quickAdd.dateChip"
          [attr.aria-label]="('quickAdd.dateChip.label' | transloco) + ': ' + dayText()"
          (click)="detailsOpen.set(true)"
        >
          @switch (dateIs()) {
            @case ('today') {
              {{ 'quickAdd.dateChip.today' | transloco: { day: dayText() } }}
            }
            @case ('yesterday') {
              {{ 'quickAdd.dateChip.yesterday' | transloco: { day: dayText() } }}
            }
            @default {
              {{ dayText() }}
            }
          }
        </button>
      </header>
      <h1 class="sr-only" data-testid="quickAdd.title">
        @switch (store.kind()) {
          @case ('income') {
            {{ 'quickAdd.title.income' | transloco }}
          }
          @case ('transfer') {
            {{ 'quickAdd.title.transfer' | transloco }}
          }
          @default {
            {{ 'quickAdd.title.expense' | transloco }}
          }
        }
      </h1>
      <app-toast-outlet class="fixed inset-x-0 top-[calc(var(--safe-top)+56px)] z-20" />

      <div class="min-h-0 flex-1 overflow-y-auto pt-2 pb-4">
        @if (store.failure(); as failure) {
          <app-banner
            data-testid="quickAdd.error"
            class="mx-4 mb-4"
            status="critical"
            [message]="failure.key | transloco: failure.params ?? {}"
            [actionLabel]="'errors.retry' | transloco"
            (action)="store.save()"
          />
        }
        @switch (store.loadState()) {
          @case ('loading') {
            <div class="flex flex-col gap-4 px-4" role="status">
              <span class="sr-only">{{ 'quickAdd.loading' | transloco }}</span>
              <app-skeleton height="44px" />
              <app-skeleton width="50%" height="48px" />
              <app-skeleton height="136px" />
            </div>
          }
          @case ('error') {
            <app-banner
              data-testid="quickAdd.loadError"
              class="mx-4"
              status="critical"
              [message]="'quickAdd.loadError' | transloco"
              [actionLabel]="'errors.retry' | transloco"
              (action)="store.init(type())"
            />
          }
          @default {
            @if (store.hasAccounts()) {
              <div class="flex flex-col gap-5">
                <app-segmented-control
                  class="mx-4"
                  data-testid="quickAdd.kind"
                  [label]="'quickAdd.kind.label' | transloco"
                  [options]="kindOptions()"
                  [value]="store.kind()"
                  (valueChange)="store.setKind($event)"
                />
                @if (store.kind() === 'transfer') {
                  <app-transfer-form
                    keypad="external"
                    compact
                    [today]="store.today()"
                    [presets]="presets()"
                    [accounts]="accountOptions()"
                    [errors]="store.fieldErrors()"
                    [(draft)]="store.transfer"
                    [(detailsOpen)]="detailsOpen"
                  />
                } @else {
                  <app-transaction-form
                    keypad="external"
                    compact
                    [showKind]="false"
                    [today]="store.today()"
                    [categoryTiles]="tiles()"
                    [accounts]="accountOptions()"
                    [people]="peopleOptions()"
                    [categories]="categoryOptions()"
                    [payees]="store.payees()"
                    [serverErrors]="store.fieldErrors()"
                    [(draft)]="store.entry"
                    [(detailsOpen)]="detailsOpen"
                  />
                }
              </div>
            } @else {
              <app-empty-state
                data-testid="quickAdd.noAccounts"
                icon="wallet"
                [title]="'quickAdd.noAccounts.title' | transloco"
                [body]="'quickAdd.noAccounts.body' | transloco"
              >
                <a appButton variant="secondary" icon="plus" routerLink="/settings/accounts">{{
                  'quickAdd.noAccounts.action' | transloco
                }}</a>
              </app-empty-state>
            }
          }
        }
      </div>

      <app-amount-keypad
        class="shrink-0"
        data-testid="quickAdd.keypad"
        [disabled]="!store.hasAccounts() || store.loadState() !== 'ready'"
        [value]="store.amountCents()"
        (valueChange)="store.setAmount($event)"
        (touch)="store.startNextEntry()"
      />
      <div class="shrink-0 px-4 pt-4 pb-[calc(var(--safe-bottom)+16px)]">
        <button
          appButton
          type="button"
          size="block"
          data-testid="quickAdd.save"
          [disabled]="!store.canSave()"
          [loading]="store.saving()"
          (click)="store.save()"
        >
          {{ 'quickAdd.save' | transloco: { amount: saveAmount() } }}
        </button>
      </div>
    </div>
  `,
})
export default class QuickAddPage {
  protected readonly store = inject(QuickAddStore)
  private readonly router = inject(Router)
  private readonly location = inject(Location)
  private readonly locale = inject(APP_LOCALE)

  /** Bound from the `type` query parameter (router component input binding). */
  readonly type = input<string | undefined>(undefined)

  protected readonly detailsOpen = signal(false)

  private readonly kindLabels = translateSignal(KIND_KEYS)
  /** Expense, income and transfer (the shared form's own segment has no transfer). */
  protected readonly kindOptions = computed<SegmentOption<QuickKind>[]>(() => {
    const labels = this.kindLabels()
    return KINDS.map((value, index) => ({ value, label: labels[index] ?? '' }))
  })

  /** "You" and "Shared" follow the language; the partner is their own name. */
  private readonly peopleLabels = translateSignal(PEOPLE_KEYS)

  protected readonly accountOptions = computed<SelectOption<number>[]>(() =>
    this.store.directory.activeAccounts().map((account) => ({
      value: account.id,
      label: account.name,
      meta: account.institution ?? undefined,
      icon: 'wallet',
    }))
  )

  /** You, the partner (when there is one) and joint, each with their own mark. */
  protected readonly peopleOptions = computed<SelectOption<number | null>[]>(() => {
    const directory = this.store.directory
    const [you = '', joint = ''] = this.peopleLabels()
    const youId = this.store.youId()
    const partner = directory.partner()
    const options: SelectOption<number | null>[] = []
    if (youId !== null) {
      options.push({ value: youId, label: you, person: directory.personOf(youId) })
    }
    if (partner) {
      options.push({
        value: partner.userId,
        label: partner.name,
        person: directory.personOf(partner.userId),
      })
    }
    options.push({ value: null, label: joint, person: 'joint' })
    return options
  })

  protected readonly categoryOptions = computed(() =>
    flattenCategories(this.store.directory.groups())
  )

  protected readonly tiles = computed<CategoryTile[]>(() =>
    this.store.categoryTiles().map(({ category }) => ({
      id: category.id,
      name: category.name,
      icon: categoryIcon(category),
    }))
  )

  protected readonly presets = computed<TransferPreset[]>(() =>
    this.store.presets().map((pair) => ({
      ...pair,
      fromName: this.accountName(pair.fromAccountId),
      toName: this.accountName(pair.toAccountId),
    }))
  )

  protected readonly saveAmount = computed(() =>
    formatTransactionAmount(this.store.signedCents(), this.store.kind(), this.locale())
  )

  protected readonly dayText = computed(() =>
    this.store.date() ? formatWeekdayDate(this.store.date(), this.locale()) : ''
  )
  protected readonly dateIs = computed<'today' | 'yesterday' | 'other'>(() => {
    const today = this.store.today()
    if (this.store.date() === today) {
      return 'today'
    }
    return this.store.date() === addDays(today, -1) ? 'yesterday' : 'other'
  })

  constructor() {
    // The `type` query parameter is read once, when the screen opens.
    effect(() => {
      const type = this.type()
      untracked(() => void this.store.init(type))
    })
  }

  /** "Done": back to the previous screen, or to the month when /add was opened directly. */
  protected done(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) {
      this.location.back()
    } else {
      void this.router.navigateByUrl('/month')
    }
  }

  private accountName(id: number): string {
    return this.store.directory.account(id)?.name ?? ''
  }
}
