import { Location } from '@angular/common'
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import {
  TranslocoPipe,
  TranslocoService,
  provideTranslocoScope,
  translateSignal,
} from '@jsverse/transloco'
import { firstValueFrom } from 'rxjs'
import { formatWeekday } from '../../domain/dates'
import { formatTransactionAmount } from '../../domain/money'
import { addDays } from '../../domain/month'
import type { TransferPair } from '../../domain/quick-add-defaults'
import { ToastOutletComponent } from '../../layouts/toast-outlet/toast-outlet.component'
import { categoryIcon } from '../../shared/icons/category-icon'
import { AmountKeypadComponent } from '../../shared/ui/amount-keypad/amount-keypad.component'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { BannerComponent } from '../../shared/ui/banner/banner.component'
import { BottomSheetService } from '../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../shared/ui/button/button.component'
import { ChipComponent } from '../../shared/ui/chip/chip.component'
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component'
import { QuickAddStore, type QuickKind, type Who } from './data-access/quick-add.store'
import type { CategoryTile } from './ui/category-grid.component'
import { TransactionFormComponent, type PresetChoice } from './ui/transaction-form.component'

/**
 * Scoped keys used from TypeScript. translateSignal() adds the "quickAdd."
 * prefix itself (relative keys); sheet titles and toasts take full keys.
 * Declared for transloco-keys-manager:
 * t(quickAdd.who.you, quickAdd.who.joint, quickAdd.who.sheet, quickAdd.category.none)
 * t(quickAdd.category.sheet, quickAdd.account.sheet)
 * t(quickAdd.transfer.fromSheet, quickAdd.transfer.toSheet)
 */
const PEOPLE_KEYS = ['who.you', 'who.joint']
const NO_CATEGORY_KEY = 'quickAdd.category.none'

/**
 * Quick add `/add` (DESIGN.md, "the sacred screen"; 3 taps ≈ 6 s). Full
 * screen, no tab bar: the keypad and the save button own the bottom edge,
 * toasts dock under the top bar. Opens with the defaults (QuickAddStore),
 * honours `?type=income|transfer` (the manifest shortcut uses
 * `?type=expense`), saves, clears and stays here for the next entry.
 * "Done" goes back to where the person came from (the month by default).
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
    SkeletonComponent,
    ToastOutletComponent,
    TransactionFormComponent,
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
          [attr.aria-label]="('quickAdd.details.date' | transloco) + ': ' + dayText()"
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

      <div class="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
        @if (store.failure(); as failure) {
          <app-banner
            data-testid="quickAdd.error"
            class="mb-4"
            status="critical"
            [message]="failure.key | transloco: failure.params ?? {}"
            [actionLabel]="'errors.retry' | transloco"
            (action)="store.save()"
          />
        }
        @switch (store.loadState()) {
          @case ('loading') {
            <div class="flex flex-col gap-4" role="status">
              <span class="sr-only">{{ 'quickAdd.loading' | transloco }}</span>
              <app-skeleton height="44px" />
              <app-skeleton width="50%" height="48px" />
              <app-skeleton height="136px" />
            </div>
          }
          @case ('error') {
            <app-banner
              data-testid="quickAdd.loadError"
              status="critical"
              [message]="'quickAdd.loadError' | transloco"
              [actionLabel]="'errors.retry' | transloco"
              (action)="store.init(type())"
            />
          }
          @default {
            @if (store.hasAccounts()) {
              <app-transaction-form
                [kind]="store.kind()"
                (kindChange)="store.setKind($event)"
                [amountCents]="store.amountCents()"
                [tiles]="tiles()"
                [categoryId]="store.categoryId()"
                [accountName]="accountName(store.accountId())"
                [whoLabel]="whoLabel()"
                [whoPerson]="store.whoPerson()"
                [fromName]="accountName(store.fromAccountId())"
                [toName]="accountName(store.toAccountId())"
                [sameAccount]="store.sameAccount()"
                [presets]="presets()"
                [payeeOptions]="store.payeeOptions()"
                [today]="store.today()"
                [errors]="store.fieldErrors()"
                [(payee)]="store.payee"
                [(note)]="store.note"
                [(date)]="store.date"
                [(isPrivate)]="store.isPrivate"
                [(detailsOpen)]="detailsOpen"
                (pickAccount)="pickAccount('accountId')"
                (pickFrom)="pickAccount('fromAccountId')"
                (pickTo)="pickAccount('toAccountId')"
                (pickWho)="pickWho()"
                (moreCategories)="pickCategory()"
                (toggleCategory)="store.toggleCategory($event)"
                (applyPreset)="store.applyPreset($event)"
              />
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
        [(value)]="store.amountCents"
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
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly router = inject(Router)
  private readonly location = inject(Location)
  private readonly locale = inject(APP_LOCALE)

  /** Bound from the `type` query parameter (router component input binding). */
  readonly type = input<string | undefined>(undefined)

  protected readonly detailsOpen = signal(false)

  protected readonly tiles = computed<CategoryTile[]>(() =>
    this.store.categoryTiles().map(({ category }) => ({
      id: category.id,
      name: category.name,
      icon: categoryIcon(category),
    }))
  )

  protected readonly presets = computed<PresetChoice[]>(() =>
    this.store.presets().map((pair) => ({
      ...pair,
      fromName: this.accountName(pair.fromAccountId),
      toName: this.accountName(pair.toAccountId),
      current: this.isCurrent(pair),
    }))
  )

  /** "You" and "Shared" follow the language; the partner is their own name. */
  private readonly peopleLabels = translateSignal(PEOPLE_KEYS)
  protected readonly whoLabel = computed(() => this.whoText(this.store.who()))

  protected readonly saveAmount = computed(() =>
    formatTransactionAmount(this.store.signedCents(), this.store.kind(), this.locale())
  )

  protected readonly dayText = computed(() => formatWeekday(this.store.date(), this.locale()))
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

  protected accountName(id: number | null): string {
    return this.store.directory.account(id)?.name ?? ''
  }

  /** "Done": back to the previous screen, or to the month when /add was opened directly. */
  protected done(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) {
      this.location.back()
    } else {
      void this.router.navigateByUrl('/month')
    }
  }

  protected async pickAccount(field: 'accountId' | 'fromAccountId' | 'toAccountId'): Promise<void> {
    const titles = {
      accountId: 'quickAdd.account.sheet',
      fromAccountId: 'quickAdd.transfer.fromSheet',
      toAccountId: 'quickAdd.transfer.toSheet',
    } as const
    const options: SelectOption<number>[] = this.store.directory
      .activeAccounts()
      .map((account) => ({
        value: account.id,
        label: account.name,
        meta: account.institution ?? undefined,
        icon: 'wallet',
      }))
    const chosen = await this.choose(titles[field], options, this.store[field]())
    if (chosen !== undefined) {
      this.store[field].set(chosen)
    }
  }

  protected async pickWho(): Promise<void> {
    const people: Who[] = this.store.directory.partner()
      ? ['you', 'partner', 'joint']
      : ['you', 'joint']
    const person = { you: 'a', partner: 'b', joint: 'joint' } as const
    const options: SelectOption<Who>[] = people.map((who) => ({
      value: who,
      label: this.whoText(who),
      person: person[who],
    }))
    const chosen = await this.choose('quickAdd.who.sheet', options, this.store.who())
    if (chosen !== undefined) {
      this.store.who.set(chosen)
    }
  }

  protected async pickCategory(): Promise<void> {
    const kind: QuickKind = this.store.kind()
    if (kind === 'transfer') {
      return
    }
    const options: SelectOption<number | null>[] = [
      { value: null, label: this.transloco.translate(NO_CATEGORY_KEY), icon: 'tag' },
      ...this.store.directory.categoriesOf(kind).map(({ category, group }) => ({
        value: category.id,
        label: category.name,
        meta: group.name,
        icon: categoryIcon(category),
      })),
    ]
    const chosen = await this.choose('quickAdd.category.sheet', options, this.store.categoryId())
    if (chosen !== undefined) {
      this.store.categoryId.set(chosen)
    }
  }

  private whoText(who: Who): string {
    const [you = '', joint = ''] = this.peopleLabels()
    switch (who) {
      case 'partner':
        return this.store.directory.partnerName()
      case 'joint':
        return joint
      default:
        return you
    }
  }

  private isCurrent(pair: TransferPair): boolean {
    return (
      this.store.fromAccountId() === pair.fromAccountId &&
      this.store.toAccountId() === pair.toAccountId
    )
  }

  private choose<T>(
    titleKey: string,
    options: SelectOption<T>[],
    selected: T | null
  ): Promise<T | undefined> {
    return firstValueFrom(
      openSelectSheet(this.sheets, {
        title: this.transloco.translate(titleKey),
        options,
        selected,
      })
    )
  }
}
