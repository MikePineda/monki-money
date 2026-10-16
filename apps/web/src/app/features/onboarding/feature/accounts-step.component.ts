import { Component, Injector, OnInit, computed, inject, output, signal } from '@angular/core'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import type { Account } from '../../../core/api/api-types'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import { hasStatus, toApiError } from '../../../core/api/http-errors'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi } from '../../../core/household/accounts.api'
import {
  ACCOUNT_PRESETS,
  matchesPreset,
  ownerChoiceOf,
  ownerUserIdFor,
  type AccountPreset,
  type OwnerChoice,
} from '../../../domain/account-presets'
import { firstName } from '../../../domain/people'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../../shared/ui/segmented-control/segmented-control.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { OtherAccountSheetComponent } from '../ui/other-account-sheet.component'

/**
 * Keys used from TypeScript, declared for transloco-keys-manager
 * (translateSignal adds the "onboarding." scope prefix itself; banners take
 * the full key):
 * t(onboarding.accounts.cash, onboarding.accounts.you, onboarding.accounts.joint)
 * t(onboarding.accounts.limit)
 */
const LABEL_KEYS = ['accounts.cash', 'accounts.you', 'accounts.joint']

interface PresetChip {
  preset: AccountPreset
  label: string
  account: Account | null
}

/**
 * Step 3 (DESIGN mock `onboarding-accounts`): tapping a preset creates that
 * account right away (incremental save), tapping it again removes it; each
 * chosen account gets an owner (you, the partner once they joined, or
 * joint). At least one account is needed to continue.
 */
@Component({
  selector: 'app-accounts-step',
  imports: [
    BannerComponent,
    ButtonComponent,
    ChipComponent,
    SegmentedControlComponent,
    SkeletonComponent,
    TranslocoPipe,
  ],
  template: `
    <h1 class="text-title text-ink-1">{{ 'onboarding.accounts.title' | transloco }}</h1>
    <p class="mt-2 text-body text-ink-2">{{ 'onboarding.accounts.body' | transloco }}</p>
    @if (failure(); as message) {
      <app-banner
        class="mt-6"
        data-testid="onboarding.accountsError"
        status="critical"
        [message]="message.key | transloco: message.params ?? {}"
      />
    }

    @if (loading()) {
      <div class="mt-8 flex flex-wrap gap-2" aria-hidden="true">
        <app-skeleton width="128px" height="36px" />
        <app-skeleton width="120px" height="36px" />
        <app-skeleton width="72px" height="36px" />
      </div>
    } @else {
      <div
        class="mt-8 flex flex-wrap gap-2"
        role="group"
        [attr.aria-label]="'onboarding.accounts.title' | transloco"
      >
        @for (chip of presetChips(); track chip.preset.id) {
          <button
            appChip
            pressable
            icon="plus"
            [attr.data-testid]="'onboarding.preset.' + chip.preset.id"
            [selected]="chip.account !== null"
            [disabled]="busy()"
            (click)="togglePreset(chip)"
          >
            {{ chip.label }}
          </button>
        }
        @for (account of customAccounts(); track account.id) {
          <button appChip pressable [selected]="true" [disabled]="busy()" (click)="remove(account)">
            {{ account.name }}
          </button>
        }
        <button
          appChip
          icon="plus"
          data-testid="onboarding.preset.other"
          [disabled]="busy()"
          (click)="addOther()"
        >
          {{ 'onboarding.accounts.other' | transloco }}
        </button>
      </div>

      @if (rows().length > 0) {
        <h2 class="mt-8 text-body text-ink-1">{{ 'onboarding.accounts.owners' | transloco }}</h2>
        <ul class="mt-2 flex flex-col">
          @for (row of rows(); track row.account.id) {
            <li class="flex flex-col gap-3 border-b border-line py-4">
              <h3 class="text-body-strong text-ink-1">{{ row.account.name }}</h3>
              <app-segmented-control
                [attr.data-testid]="'onboarding.owner.' + row.account.id"
                [label]="'onboarding.accounts.ownerOf' | transloco: { name: row.account.name }"
                [options]="ownerOptions()"
                [value]="row.owner"
                (valueChange)="setOwner(row.account, $event)"
              />
            </li>
          }
        </ul>
        @if (!partner()) {
          <p class="mt-3 text-caption text-ink-3">
            {{ 'onboarding.accounts.partnerLater' | transloco }}
          </p>
        }
      }
    }

    <div class="mt-auto pt-8">
      <button
        appButton
        type="button"
        size="block"
        data-testid="onboarding.continue"
        [disabled]="!canContinue()"
        (click)="done.emit()"
      >
        {{ 'onboarding.continue' | transloco }}
      </button>
    </div>
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export class AccountsStepComponent implements OnInit {
  private readonly session = inject(SessionStore)
  private readonly accountsApi = inject(AccountsApi)
  private readonly sheets = inject(BottomSheetService)
  private readonly injector = inject(Injector)

  readonly done = output<void>()

  private readonly labels = translateSignal(LABEL_KEYS)

  protected readonly accounts = signal<Account[]>([])
  protected readonly loading = signal(true)
  protected readonly busy = signal(false)
  protected readonly failure = signal<Message | null>(null)

  protected readonly canContinue = computed(() => this.accounts().length > 0 && !this.busy())

  private readonly youId = computed(() => this.session.user()?.id ?? 0)
  /** The other member, from the session (`GET /auth/me`), once they joined. */
  protected readonly partner = this.session.partner

  protected readonly presetChips = computed<PresetChip[]>(() => {
    const [cash = ''] = this.labels()
    return ACCOUNT_PRESETS.map((preset) => ({
      preset,
      label: preset.name ?? cash,
      account: this.accounts().find((account) => matchesPreset(account, preset)) ?? null,
    }))
  })

  protected readonly customAccounts = computed(() =>
    this.accounts().filter(
      (account) => !ACCOUNT_PRESETS.some((preset) => matchesPreset(account, preset))
    )
  )

  protected readonly rows = computed(() =>
    this.accounts().map((account) => ({
      account,
      owner: ownerChoiceOf(account.ownerUserId, this.youId()),
    }))
  )

  protected readonly ownerOptions = computed<SegmentOption<OwnerChoice>[]>(() => {
    const [, you = '', joint = ''] = this.labels()
    const partner = this.partner()
    return [
      { value: 'you', label: you },
      ...(partner ? [{ value: 'partner' as const, label: firstName(partner.displayName) }] : []),
      { value: 'joint', label: joint },
    ]
  })

  async ngOnInit(): Promise<void> {
    // A partner may have accepted the invitation since the app opened.
    void this.session.refresh()
    try {
      const accounts = await this.accountsApi.list()
      this.accounts.set(accounts.filter((account) => account.isActive))
    } catch (error) {
      this.failure.set(failureMessage(toApiError(error)))
    } finally {
      this.loading.set(false)
    }
  }

  protected async togglePreset(chip: PresetChip): Promise<void> {
    if (chip.account) {
      await this.remove(chip.account)
      return
    }
    await this.run(async () => {
      const account = await this.accountsApi.create({
        name: chip.label,
        kind: chip.preset.kind,
        institution: chip.preset.institution,
        ownerUserId: chip.preset.owner === 'you' ? this.youId() : null,
      })
      this.accounts.update((list) => [...list, account])
    })
  }

  protected addOther(): void {
    this.sheets
      .open<string>(OtherAccountSheetComponent, { injector: this.injector })
      .closed.subscribe((name) => {
        if (!name) {
          return
        }
        void this.run(async () => {
          const account = await this.accountsApi.create({
            name,
            kind: 'other',
            ownerUserId: this.youId(),
          })
          this.accounts.update((list) => [...list, account])
        })
      })
  }

  protected async remove(account: Account): Promise<void> {
    await this.run(async () => {
      await this.accountsApi.remove(account.id)
      this.accounts.update((list) => list.filter((item) => item.id !== account.id))
    })
  }

  protected async setOwner(account: Account, choice: OwnerChoice): Promise<void> {
    await this.run(async () => {
      const updated = await this.accountsApi.update(account.id, {
        ownerUserId: ownerUserIdFor(choice, this.youId(), this.partner()?.id ?? null),
      })
      this.accounts.update((list) => list.map((item) => (item.id === updated.id ? updated : item)))
    })
  }

  /** One change at a time; a failure leaves the list as the API has it. */
  private async run(change: () => Promise<void>): Promise<void> {
    if (this.busy()) {
      return
    }
    this.busy.set(true)
    this.failure.set(null)
    try {
      await change()
    } catch (error) {
      const failure = toApiError(error)
      this.failure.set(
        hasStatus(failure, 402)
          ? {
              key: 'onboarding.accounts.limit',
              params: { max: this.session.entitlements()?.maxAccounts ?? 0 },
            }
          : failureMessage(failure)
      )
    } finally {
      this.busy.set(false)
    }
  }
}
