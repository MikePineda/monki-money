import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, Injector, computed, inject } from '@angular/core'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import { formatWeekdayDate } from '../../../domain/dates'
import {
  acceptChange,
  allowedActions,
  assignCategoryChanges,
  restoreChange,
  rowState,
  type RowChange,
} from '../../../domain/import-row'
import { formatTransactionAmount } from '../../../domain/money'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'
import { RowTriageComponent, type TriageStatus } from '../../../shared/review/row-triage.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { CheckboxComponent } from '../../../shared/ui/checkbox/checkbox.component'
import type { Person } from '../../../shared/ui/person-dot/person-dot.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../../../shared/ui/select-sheet/select-sheet.component'
import { ImportReviewStore } from '../import-review.store'
import { importRowView } from './import-row.view'
import { ImportSplitSheetComponent, type ImportSplitSheetData } from './import-split.sheet'
import { importRowContext } from './import-words'

export interface ImportRowSheetData {
  rowId: number
}

/** "Not a transfer" in the transfer select sheet. */
const NOT_A_TRANSFER = -1

/**
 * Keys read from TypeScript:
 * t(import.triage.categoryTitle, import.triage.transferTitle, import.triage.payerTitle)
 * t(import.triage.notTransfer, import.triage.card, import.triage.pending)
 * t(import.reason.possible_match, import.reason.transfer_destination_unknown)
 * t(import.reason.category_needs_review, import.reason.future_date, import.reason.zero_amount)
 * t(import.reason.duplicate_hash, import.triage.accept)
 */
const KEYS = {
  categoryTitle: 'import.triage.categoryTitle',
  transferTitle: 'import.triage.transferTitle',
  payerTitle: 'import.triage.payerTitle',
  notTransfer: 'import.triage.notTransfer',
  card: 'import.triage.card',
  pending: 'import.triage.pending',
}

/** A key of this scope, read only to know when the catalogue is in: t(import.triage.title) */
const CATALOGUE_PROBE = 'triage.title'

/**
 * The triage sheet of one bank row (shared `RowTriage` frame): the bank
 * text and why the row needs a look, then every decision the row allows:
 * accept the suggestion, link the transaction found, pick a category or
 * split it, make it a transfer, change who paid, create it new, remember
 * the merchant, ignore or restore. Each choice is saved at once through
 * the review store (optimistic, rolled back on refusal); the sheet follows
 * the row as it changes and "Done" closes it.
 */
@Component({
  selector: 'app-import-row-sheet',
  imports: [ButtonComponent, CheckboxComponent, IconComponent, RowTriageComponent, TranslocoPipe],
  template: `
    @if (row(); as current) {
      <app-row-triage
        data-testid="import.triage"
        [title]="'import.triage.title' | transloco"
        [heading]="view()?.title ?? ''"
        [meta]="facts()"
        [amountCents]="current.amountCents"
        [kind]="view()?.kind ?? 'expense'"
        [status]="status()"
        [closeLabel]="'ui.sheet.close' | transloco"
      >
        <div triageSummary class="flex flex-col gap-1">
          @if (current.description && !current.isMasked) {
            <p class="text-caption break-words text-ink-2" data-testid="import.triage.bank">
              {{ current.description }}
            </p>
          }
          @for (reason of reasons(); track reason) {
            <p class="text-caption text-ink-3">{{ reason }}</p>
          }
        </div>

        @if (actions().has('accept') && acceptText(); as text) {
          <button
            type="button"
            [class]="rowClass"
            data-testid="import.triage.accept"
            (click)="decide(accept())"
          >
            <app-icon name="check" class="text-accent" />
            <span class="min-w-0 flex-1 truncate text-body text-accent">{{ text }}</span>
          </button>
        }
        @if (actions().has('link') && current.match; as match) {
          <button
            type="button"
            [class]="rowClass"
            data-testid="import.triage.link"
            (click)="
              decide({ resolution: 'auto_matched', matchTransactionId: match.transactionId })
            "
          >
            <app-icon name="link" class="text-ink-2" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-body text-ink-1">{{
                'import.triage.link' | transloco
              }}</span>
              <span class="truncate text-caption text-ink-3">{{ matchText() }}</span>
            </span>
          </button>
        }
        @if (actions().has('category')) {
          <button
            type="button"
            [class]="rowClass"
            data-testid="import.triage.category"
            aria-haspopup="dialog"
            (click)="chooseCategory()"
          >
            <app-icon [name]="categoryGlyph()" class="text-ink-2" />
            <span class="min-w-0 flex-1 truncate text-body text-ink-1">{{
              'import.triage.category' | transloco
            }}</span>
            <span class="max-w-[50%] truncate text-body text-ink-2">{{ categoryText() }}</span>
            <app-icon name="chevron-right" class="text-ink-2" />
          </button>
        }
        @if (actions().has('split')) {
          <button
            type="button"
            [class]="rowClass"
            data-testid="import.triage.split"
            aria-haspopup="dialog"
            (click)="split()"
          >
            <app-icon name="split" class="text-ink-2" />
            <span class="min-w-0 flex-1 truncate text-body text-ink-1">{{
              'import.triage.split' | transloco
            }}</span>
            @if (state()?.splitCount; as lines) {
              <span class="text-body text-ink-2">{{
                'import.triage.splitLines' | transloco: { count: lines }
              }}</span>
            }
            <app-icon name="chevron-right" class="text-ink-2" />
          </button>
        }
        @if (actions().has('transfer')) {
          <button
            type="button"
            [class]="rowClass"
            data-testid="import.triage.transfer"
            aria-haspopup="dialog"
            (click)="chooseTransfer()"
          >
            <app-icon name="arrow-left-right" class="text-ink-2" />
            <span class="min-w-0 flex-1 truncate text-body text-ink-1">{{
              'import.triage.transfer' | transloco
            }}</span>
            <span class="max-w-[50%] truncate text-body text-ink-2">{{ transferText() }}</span>
            <app-icon name="chevron-right" class="text-ink-2" />
          </button>
        }
        @if (actions().has('payer')) {
          <button
            type="button"
            [class]="rowClass"
            data-testid="import.triage.payer"
            aria-haspopup="dialog"
            (click)="choosePayer()"
          >
            <app-icon name="users" class="text-ink-2" />
            <span class="min-w-0 flex-1 truncate text-body text-ink-1">{{
              'import.triage.payer' | transloco
            }}</span>
            <span class="max-w-[50%] truncate text-body text-ink-2">{{ payerText() }}</span>
            <app-icon name="chevron-right" class="text-ink-2" />
          </button>
        }
        @if (actions().has('create')) {
          <button
            type="button"
            [class]="rowClass"
            data-testid="import.triage.create"
            (click)="decide({ resolution: 'new' })"
          >
            <app-icon name="circle-plus" class="text-ink-2" />
            <span class="min-w-0 flex-1 truncate text-body text-ink-1">{{
              'import.triage.create' | transloco
            }}</span>
          </button>
        }
        @if (canLearn()) {
          <app-checkbox
            class="px-4"
            data-testid="import.triage.learn"
            [checked]="state()?.learnRule ?? true"
            (checkedChange)="decide({ learnRule: $event })"
          >
            {{ 'import.triage.learn' | transloco }}
            <span class="block text-caption text-ink-3">{{
              'import.triage.learnHint' | transloco
            }}</span>
          </app-checkbox>
        }
        @if (actions().has('ignore')) {
          <button
            type="button"
            [class]="rowClass"
            data-testid="import.triage.ignore"
            (click)="decide({ resolution: 'ignored' })"
          >
            <app-icon name="ban" class="text-ink-2" />
            <span class="min-w-0 flex-1 truncate text-body text-ink-1">{{
              'import.triage.ignore' | transloco
            }}</span>
          </button>
        }
        @if (actions().has('restore')) {
          <button
            type="button"
            [class]="rowClass"
            data-testid="import.triage.restore"
            (click)="decide(restore())"
          >
            <app-icon name="undo-2" class="text-ink-2" />
            <span class="min-w-0 flex-1 truncate text-body text-ink-1">{{
              'import.triage.restore' | transloco
            }}</span>
          </button>
        }
        @if (actions().size === 0) {
          <p class="px-4 py-2 text-body text-ink-2" data-testid="import.triage.nothing">
            {{ (current.isMasked ? 'import.triage.private' : 'import.triage.nothing') | transloco }}
          </p>
        }

        <button
          triageFooter
          appButton
          type="button"
          size="block"
          data-testid="import.triage.done"
          (click)="close()"
        >
          {{ 'import.triage.done' | transloco }}
        </button>
      </app-row-triage>
    }
  `,
})
export class ImportRowSheetComponent {
  private readonly data = inject<ImportRowSheetData>(DIALOG_DATA)
  private readonly dialogRef = inject<DialogRef<void>>(DialogRef)
  private readonly store = inject(ImportReviewStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly injector = inject(Injector)
  private readonly transloco = inject(TranslocoService)
  private readonly locale = inject(APP_LOCALE)
  private readonly directory = this.store.directory
  /** Changes once the catalogue is in (computed wording depends on it). */
  private readonly catalogue = translateSignal(CATALOGUE_PROBE)
  private readonly t = (key: string, params?: Record<string, string | number>): string =>
    this.transloco.translate(key, params)

  protected readonly rowClass =
    'flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2'

  protected readonly row = computed(
    () => this.store.rows().find((row) => row.id === this.data.rowId) ?? null
  )
  protected readonly state = computed(() => {
    const row = this.row()
    return row ? rowState(row) : null
  })
  protected readonly actions = computed(() => {
    const row = this.row()
    return row && this.store.isStaged() ? allowedActions(row) : new Set<string>()
  })
  protected readonly view = computed(() => {
    this.catalogue()
    const row = this.row()
    return row ? importRowView(row, importRowContext(this.t, this.locale(), this.directory)) : null
  })
  protected readonly status = computed<TriageStatus | null>(() => {
    const view = this.view()
    if (!view) {
      return null
    }
    const tone: Record<string, TriageStatus['tone']> = {
      auto: 'good',
      doubtful: 'warning',
    }
    return { icon: view.status.icon, label: view.status.label, tone: tone[view.tone] ?? null }
  })

  protected readonly facts = computed(() => {
    this.catalogue()
    const row = this.row()
    if (!row) {
      return []
    }
    const batch = this.store.batch()
    const account = batch ? (this.directory.account(batch.accountId)?.name ?? '') : ''
    return [
      formatWeekdayDate(row.date, this.locale(), { withYear: true }),
      account,
      row.cardSuffix ? this.t(KEYS.card, { suffix: row.cardSuffix }) : '',
      row.isPending ? this.t(KEYS.pending) : '',
    ]
  })

  protected readonly reasons = computed(() => {
    this.catalogue()
    return (this.row()?.reasons ?? []).map((reason) => this.t(`import.reason.${reason}`))
  })

  protected readonly accept = computed<RowChange>(() => {
    const row = this.row()
    return (row && acceptChange(row)) ?? {}
  })

  /** "Accept Groceries" for a suggested category; the link row covers a match. */
  protected readonly acceptText = computed(() => {
    this.catalogue()
    const change = this.accept()
    if (!change.categoryId) {
      return ''
    }
    const name = this.directory.category(change.categoryId)?.category.name ?? ''
    return this.t('import.triage.accept', { category: name })
  })

  protected readonly matchText = computed(() => {
    const match = this.row()?.match
    if (!match?.transaction) {
      return ''
    }
    const { transaction } = match
    const kind = transaction.amountCents < 0 ? 'expense' : 'income'
    return [
      transaction.payee ?? '',
      formatWeekdayDate(transaction.date, this.locale()),
      formatTransactionAmount(transaction.amountCents, kind, this.locale()),
    ]
      .filter(Boolean)
      .join(' · ')
  })

  protected readonly categoryText = computed(() => {
    this.catalogue()
    const state = this.state()
    if (!state || state.categoryId === null) {
      return this.t('import.row.uncategorized')
    }
    const name = this.directory.category(state.categoryId)?.category.name ?? ''
    return state.tone === 'doubtful' ? this.t('import.row.suggestion', { category: name }) : name
  })

  protected readonly categoryGlyph = computed<IconName>(() => {
    const id = this.state()?.categoryId ?? null
    return id === null ? 'circle-dashed' : categoryIcon(this.directory.category(id)?.category)
  })

  protected readonly transferText = computed(() => {
    this.catalogue()
    const row = this.row()
    const state = this.state()
    if (!row || !state || (row.resolution !== 'transfer_leg' && !row.transfer)) {
      return this.t('import.triage.notTransfer')
    }
    const account =
      state.transferAccountId === null ? null : this.directory.account(state.transferAccountId)
    return account?.name ?? this.t('import.row.transferUnknown')
  })

  protected readonly payerText = computed(() => {
    this.catalogue()
    return this.view()?.personLabel || this.t('import.people.joint')
  })

  /** Learning only matters for rows that become spending, income or a transfer. */
  protected readonly canLearn = computed(() => {
    const actions = this.actions()
    const row = this.row()
    return (
      !!row &&
      row.resolution !== 'ignored' &&
      row.resolution !== 'auto_matched' &&
      actions.has('category')
    )
  })

  protected decide(change: RowChange): void {
    void this.store.decide(this.data.rowId, change)
  }

  protected restore(): RowChange {
    const row = this.row()
    return row ? restoreChange(row) : {}
  }

  protected chooseCategory(): void {
    const row = this.row()
    if (!row) {
      return
    }
    const kind = row.amountCents < 0 ? 'expense' : 'income'
    const other = kind === 'expense' ? 'income' : 'expense'
    const options: SelectOption<number>[] = [
      ...this.directory.categoriesOf(kind),
      ...this.directory.categoriesOf(other),
    ].map(({ category, group }) => ({
      value: category.id,
      label: category.name,
      meta: group.name,
      icon: categoryIcon(category),
    }))
    openSelectSheet(this.sheets, {
      title: this.t(KEYS.categoryTitle),
      options,
      selected: this.state()?.categoryId ?? null,
    }).subscribe((categoryId) => {
      const current = this.row()
      if (categoryId !== undefined && current) {
        const [request] = assignCategoryChanges([current], categoryId)
        if (request) {
          this.decide(request.change)
        }
      }
    })
  }

  protected chooseTransfer(): void {
    const row = this.row()
    const batch = this.store.batch()
    if (!row || !batch) {
      return
    }
    const isTransfer = row.resolution === 'transfer_leg'
    const options: SelectOption<number>[] = [
      ...(isTransfer
        ? [{ value: NOT_A_TRANSFER, label: this.t(KEYS.notTransfer), icon: 'x' as IconName }]
        : []),
      ...this.directory
        .activeAccounts()
        .filter((account) => account.id !== batch.accountId)
        .map((account) => ({
          value: account.id,
          label: account.name,
          icon: 'landmark' as IconName,
        })),
    ]
    openSelectSheet(this.sheets, {
      title: this.t(KEYS.transferTitle),
      options,
      selected: isTransfer ? this.state()?.transferAccountId : undefined,
    }).subscribe((accountId) => {
      if (accountId === NOT_A_TRANSFER) {
        this.decide({ resolution: 'new' })
      } else if (accountId !== undefined) {
        this.decide({ resolution: 'transfer_leg', transferAccountId: accountId })
      }
    })
  }

  protected choosePayer(): void {
    const options: SelectOption<number | null>[] = []
    const you = this.directory.youId()
    const partner = this.directory.partner()
    if (you !== null) {
      options.push({
        value: you,
        label: this.t('import.people.you'),
        person: this.directory.personOf(you),
      })
    }
    if (partner) {
      options.push({ value: partner.userId, label: partner.name, person: partner.person as Person })
    }
    options.push({ value: null, label: this.t('import.people.joint'), person: 'joint' })
    openSelectSheet(this.sheets, {
      title: this.t(KEYS.payerTitle),
      options,
      selected: this.state()?.paidByUserId ?? null,
    }).subscribe((paidByUserId) => {
      if (paidByUserId !== undefined) {
        this.decide({ paidByUserId })
      }
    })
  }

  protected split(): void {
    this.sheets.open<void, ImportSplitSheetData>(ImportSplitSheetComponent, {
      data: { rowId: this.data.rowId },
      injector: this.injector,
    })
  }

  protected close(): void {
    this.dialogRef.close()
  }
}
