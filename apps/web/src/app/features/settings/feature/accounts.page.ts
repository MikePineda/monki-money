import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import type { Account, AccountCard } from '../../../core/api/api-types'
import { failureMessage } from '../../../core/api/error-messages'
import { hasStatus, toApiError } from '../../../core/api/http-errors'
import { canAddAccount } from '../../../core/auth/entitlements'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi } from '../../../core/household/accounts.api'
import { ToastStore } from '../../../core/ui/toast.store'
import {
  ownerChoiceOf,
  ownerUserIdFor,
  type AccountKind,
  type OwnerChoice,
} from '../../../domain/account-presets'
import { formatMoney } from '../../../domain/money'
import { firstName } from '../../../domain/people'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { CardComponent } from '../../../shared/ui/card/card.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import type { SegmentOption } from '../../../shared/ui/segmented-control/segmented-control.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { provideSettingsScope } from '../settings.scope'
import {
  AccountSheetComponent,
  type AccountSheetData,
  type AccountSheetResult,
} from '../ui/account-sheet.component'
import { CardSheetComponent, type CardSheetResult } from '../ui/card-sheet.component'
import { SettingsRowComponent } from '../ui/settings-row.component'

/**
 * Scoped keys used from TypeScript. translateSignal() adds the "settings."
 * scope prefix itself (relative keys below); toasts and sheet titles take
 * full keys. Declared for transloco-keys-manager:
 * t(settings.accounts.kinds.transaction, settings.accounts.kinds.savings)
 * t(settings.accounts.kinds.wallet, settings.accounts.kinds.cash, settings.accounts.kinds.other)
 * t(settings.accounts.owners.you, settings.accounts.owners.joint)
 * t(settings.accounts.add, settings.accounts.limit, settings.errors.invalid)
 */
const KIND_KEYS: Record<AccountKind, string> = {
  transaction: 'accounts.kinds.transaction',
  savings: 'accounts.kinds.savings',
  wallet: 'accounts.kinds.wallet',
  cash: 'accounts.kinds.cash',
  other: 'accounts.kinds.other',
}
const OWNER_KEYS = ['accounts.owners.you', 'accounts.owners.joint']
const ADD_TITLE_KEY = 'settings.accounts.add'

interface AccountRow {
  account: Account
  meta: string
  /** The available balance ("$1,200.00") when pending movements make it differ; else null. */
  available: string | null
  cards: { card: AccountCard; label: string }[]
}

/**
 * The household's accounts: list with each one's cleared balance (and the
 * available one under it while pending movements make them differ), create,
 * edit (opening balance and its date included), archive (and restore),
 * owner (you, the partner or joint) and, on joint accounts, the cards each
 * person carries (so imports know who paid). A save shows the balance the
 * API answers with, so a new opening balance moves it at once. A wallet
 * account (an umbrella service's) links to its payslips. A list that did
 * not load says so with "Try again", never the empty state's invitation to
 * add (which would duplicate accounts).
 */
@Component({
  selector: 'app-accounts-page',
  imports: [
    AmountDisplayComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    IconButtonComponent,
    IconComponent,
    RouterLink,
    SettingsRowComponent,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [provideSettingsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-4 pl-1">
      <a
        appIconButton
        icon="arrow-left"
        routerLink="/settings"
        [label]="'settings.back' | transloco"
      ></a>
      <h1 class="text-heading text-ink-1">{{ 'settings.accounts.title' | transloco }}</h1>
    </header>

    <div class="flex flex-col gap-4 px-gutter pt-2 pb-8" data-testid="accounts.page">
      @if (loading()) {
        <app-skeleton height="56px" />
        <app-skeleton height="56px" />
      } @else if (failed()) {
        <!-- Not the empty state: an "Add account" here would invite duplicates. -->
        <app-empty-state
          data-testid="accounts.error"
          icon="wifi-off"
          [title]="'settings.accounts.error.title' | transloco"
          [body]="'settings.accounts.error.body' | transloco"
        >
          <button
            appButton
            type="button"
            variant="secondary"
            icon="refresh-cw"
            data-testid="accounts.retry"
            (click)="load()"
          >
            {{ 'errors.retry' | transloco }}
          </button>
        </app-empty-state>
      } @else {
        @for (row of activeRows(); track row.account.id) {
          <app-card
            class="gap-0! overflow-hidden p-0!"
            [attr.data-testid]="'accounts.' + row.account.id"
          >
            <button
              type="button"
              class="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
              [disabled]="busy()"
              (click)="edit(row.account)"
            >
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-body text-ink-1">{{ row.account.name }}</span>
                <span class="truncate text-caption text-ink-3">{{ row.meta }}</span>
              </span>
              <span class="flex shrink-0 flex-col items-end">
                <span data-testid="accounts.balance">
                  <span class="sr-only">{{ 'settings.accounts.balance' | transloco }}</span>
                  <app-amount-display [cents]="row.account.clearedBalanceCents" />
                </span>
                @if (row.available; as amount) {
                  <span
                    class="text-caption whitespace-nowrap text-ink-3 tnum"
                    data-testid="accounts.available"
                    >{{ 'settings.accounts.available' | transloco: { amount } }}</span
                  >
                }
              </span>
              <app-icon name="pencil" class="shrink-0 text-ink-2" />
            </button>
            @if (row.account.kind === 'wallet') {
              <a
                appSettingsRow
                data-testid="accounts.payslips"
                [routerLink]="['/settings/accounts', row.account.id, 'payslips']"
              >
                {{ 'settings.accounts.payslips' | transloco }}
              </a>
            }
            @if (row.account.isJoint) {
              @for (item of row.cards; track item.card.id) {
                <div class="flex h-12 items-center gap-2 border-t border-line pr-1 pl-4">
                  <span class="min-w-0 flex-1 truncate text-body text-ink-2 tnum">{{
                    item.label
                  }}</span>
                  <button
                    appIconButton
                    type="button"
                    icon="x"
                    [label]="'settings.accounts.cards.remove' | transloco"
                    [disabled]="busy()"
                    (click)="removeCard(row.account, item.card)"
                  ></button>
                </div>
              }
              <button
                appSettingsRow
                type="button"
                trailing="credit-card"
                [disabled]="busy()"
                (click)="addCard(row.account)"
              >
                {{ 'settings.accounts.cards.add' | transloco }}
              </button>
            }
          </app-card>
        } @empty {
          <app-empty-state
            icon="wallet"
            [title]="'settings.accounts.empty.title' | transloco"
            [body]="'settings.accounts.empty.body' | transloco"
          />
        }

        @if (canAdd()) {
          <button
            appButton
            type="button"
            variant="secondary"
            icon="plus"
            class="w-full"
            data-testid="accounts.add"
            [disabled]="busy()"
            (click)="create()"
          >
            {{ 'settings.accounts.add' | transloco }}
          </button>
        } @else {
          <p class="text-caption text-ink-3">{{ 'settings.accounts.atLimit' | transloco }}</p>
        }

        @if (archivedRows().length > 0) {
          <h2 class="mt-4 text-eyebrow text-ink-2 uppercase">
            {{ 'settings.accounts.archived' | transloco }}
          </h2>
          <app-card class="gap-0! overflow-hidden p-0!">
            @for (row of archivedRows(); track row.account.id) {
              <button appSettingsRow type="button" [value]="row.meta" (click)="edit(row.account)">
                {{ row.account.name }}
              </button>
            }
          </app-card>
        }
      }
    </div>
  `,
})
export default class AccountsPage implements OnInit {
  private readonly session = inject(SessionStore)
  private readonly accountsApi = inject(AccountsApi)
  private readonly sheets = inject(BottomSheetService)
  private readonly toasts = inject(ToastStore)
  private readonly transloco = inject(TranslocoService)
  private readonly injector = inject(Injector)
  private readonly locale = inject(APP_LOCALE)

  private readonly ownerLabels = translateSignal(OWNER_KEYS)
  private readonly kindLabels = translateSignal(Object.values(KIND_KEYS))

  protected readonly accounts = signal<Account[]>([])
  protected readonly loading = signal(true)
  /** The list did not load. */
  protected readonly failed = signal(false)
  protected readonly busy = signal(false)

  private readonly youId = computed(() => this.session.user()?.id ?? 0)
  /** Names and colours come with the session (`GET /auth/me`). */
  private readonly members = this.session.members
  private readonly partner = this.session.partner

  private readonly kinds = computed(() => {
    const labels = this.kindLabels()
    return (Object.keys(KIND_KEYS) as AccountKind[]).map((value, index) => ({
      value,
      label: labels[index] ?? value,
    }))
  })

  private readonly owners = computed<SegmentOption<OwnerChoice>[]>(() => {
    const [you = '', joint = ''] = this.ownerLabels()
    const partner = this.partner()
    return [
      { value: 'you', label: you },
      ...(partner ? [{ value: 'partner' as const, label: firstName(partner.displayName) }] : []),
      { value: 'joint', label: joint },
    ]
  })

  protected readonly activeRows = computed(() =>
    this.accounts()
      .filter((account) => account.isActive)
      .map((account) => this.row(account))
  )
  protected readonly archivedRows = computed(() =>
    this.accounts()
      .filter((account) => !account.isActive)
      .map((account) => this.row(account))
  )
  protected readonly canAdd = computed(() =>
    canAddAccount(this.accounts().length, this.session.entitlements())
  )

  async ngOnInit(): Promise<void> {
    // The names come from the session: pick up a partner who joined since the app opened.
    void this.session.refresh()
    await this.load()
  }

  /** Reads the list; a failure shows the error state with "Try again" (never the empty one). */
  protected async load(): Promise<void> {
    this.loading.set(true)
    this.failed.set(false)
    try {
      this.accounts.set(await this.accountsApi.list())
    } catch {
      this.failed.set(true)
    } finally {
      this.loading.set(false)
    }
  }

  protected create(): void {
    this.openAccountSheet({
      title: this.transloco.translate(ADD_TITLE_KEY),
      kinds: this.kinds(),
      owners: this.owners(),
    }).subscribe((result) => {
      if (result?.action === 'save') {
        void this.run(async () => {
          const account = await this.accountsApi.create({
            ...result.input,
            ownerUserId: this.ownerId(result.owner),
          })
          this.accounts.update((list) => [...list, account])
        })
      }
    })
  }

  protected edit(account: Account): void {
    this.openAccountSheet({
      title: account.name,
      initial: {
        name: account.name,
        institution: account.institution,
        kind: account.kind,
        owner: ownerChoiceOf(account.ownerUserId, this.youId()),
        openingBalanceCents: account.openingBalanceCents,
        openingBalanceDate: account.openingBalanceDate,
      },
      isActive: account.isActive,
      kinds: this.kinds(),
      owners: this.owners(),
    }).subscribe((result) => {
      if (result) {
        void this.run(async () => this.replace(await this.apply(account, result)))
      }
    })
  }

  protected addCard(account: Account): void {
    const holders = this.members().map((member) => ({
      value: member.id,
      label: firstName(member.displayName),
    }))
    this.sheets
      .open<CardSheetResult>(CardSheetComponent, { data: { holders }, injector: this.injector })
      .closed.subscribe((card) => {
        if (card) {
          void this.run(async () => {
            const created = await this.accountsApi.addCard(account.id, card)
            this.replace({ ...account, cards: [...account.cards, created] })
          })
        }
      })
  }

  protected removeCard(account: Account, card: AccountCard): void {
    void this.run(async () => {
      await this.accountsApi.removeCard(account.id, card.id)
      this.replace({ ...account, cards: account.cards.filter((item) => item.id !== card.id) })
    })
  }

  private async apply(account: Account, result: AccountSheetResult): Promise<Account> {
    switch (result.action) {
      case 'archive':
        return this.accountsApi.update(account.id, { isActive: false })
      case 'restore':
        return this.accountsApi.update(account.id, { isActive: true })
      default:
        return this.accountsApi.update(account.id, {
          ...result.input,
          ownerUserId: this.ownerId(result.owner),
        })
    }
  }

  private row(account: Account): AccountRow {
    const [you = '', joint = ''] = this.ownerLabels()
    const owner =
      account.ownerUserId === null
        ? joint
        : account.ownerUserId === this.youId()
          ? you
          : firstName(this.memberName(account.ownerUserId))
    const kind = this.kinds().find((item) => item.value === account.kind)?.label ?? ''
    return {
      account,
      meta: [kind, owner].filter(Boolean).join(' · '),
      available:
        account.availableBalanceCents === account.clearedBalanceCents
          ? null
          : formatMoney(account.availableBalanceCents, this.locale()),
      cards: account.cards.map((card) => ({
        card,
        label: [
          `•••• ${card.cardSuffix}`,
          card.userId ? firstName(this.memberName(card.userId)) : '',
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    }
  }

  private memberName(userId: number): string {
    return this.members().find((member) => member.id === userId)?.displayName ?? ''
  }

  private ownerId(choice: OwnerChoice): number | null {
    return ownerUserIdFor(choice, this.youId(), this.partner()?.id ?? null)
  }

  private replace(account: Account): void {
    this.accounts.update((list) => list.map((item) => (item.id === account.id ? account : item)))
  }

  private openAccountSheet(data: AccountSheetData) {
    return this.sheets.open<AccountSheetResult>(AccountSheetComponent, {
      data,
      injector: this.injector,
    }).closed
  }

  private async run(change: () => Promise<void>): Promise<void> {
    if (this.busy()) {
      return
    }
    this.busy.set(true)
    try {
      await change()
    } catch (error) {
      this.showFailure(error)
    } finally {
      this.busy.set(false)
    }
  }

  private showFailure(error: unknown): void {
    const failure = toApiError(error)
    if (failure.kind === 'unauthorized') {
      return
    }
    const fieldMessage =
      failure.kind === 'validation' ? Object.values(failure.fields)[0] : undefined
    if (fieldMessage) {
      this.toasts.show({
        messageKey: 'settings.errors.invalid',
        params: { message: fieldMessage },
        status: 'critical',
      })
    } else if (hasStatus(failure, 402)) {
      this.toasts.show({
        messageKey: 'settings.accounts.limit',
        params: { max: this.session.entitlements()?.maxAccounts ?? 0 },
        status: 'critical',
      })
    } else {
      const message = failureMessage(failure)
      this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
    }
  }
}
