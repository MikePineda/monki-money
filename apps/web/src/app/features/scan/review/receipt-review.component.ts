import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import { flattenCategories } from '../../../domain/category-tree'
import { formatMoney, formatTransactionAmount } from '../../../domain/money'
import type { ReceiptConfidence, ReceiptDraft } from '../../../domain/receipt-draft'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'
import { BulkBarComponent } from '../../../shared/review/bulk-bar.component'
import { ReviewListComponent, type ReviewKey } from '../../../shared/review/review-list.component'
import { ReviewRowDirective } from '../../../shared/review/review-row.directive'
import { TransactionFormComponent } from '../../../shared/transaction-form/transaction-form.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { CheckboxComponent } from '../../../shared/ui/checkbox/checkbox.component'
import { openConfirmSheet } from '../../../shared/ui/confirm-sheet/confirm-sheet.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../../../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { ReceiptLineItemComponent, type ReceiptLineView } from './receipt-line-item.component'
import { ReceiptReviewStore } from './receipt-review.store'

/**
 * Scoped keys read from TypeScript (relative to the page's `scan` scope):
 * t(scan.review.who.you, scan.review.who.joint)
 * t(scan.review.confidence.high, scan.review.confidence.medium, scan.review.confidence.low)
 * t(scan.review.issue.tooFewLines, scan.review.issue.missingCategory, scan.review.issue.zeroLine)
 * t(scan.review.issue.overTotal, scan.review.issue.tooManyLines)
 * t(scan.review.check, scan.review.lineCategory, scan.review.uncategorized)
 * t(scan.review.discardSheet.title, scan.review.discardSheet.body)
 * t(scan.review.discardSheet.confirm, scan.review.discardSheet.keep)
 */
const PEOPLE_KEYS = ['review.who.you', 'review.who.joint']

const CONFIDENCE_ICON: Record<ReceiptConfidence, IconName> = {
  high: 'circle-check',
  medium: 'triangle-alert',
  low: 'triangle-alert',
}
const CONFIDENCE_CLASS: Record<ReceiptConfidence, string> = {
  high: 'text-status-good',
  medium: 'text-status-warning',
  low: 'text-status-warning',
}

/**
 * Reviewing a scanned receipt (the review half of `/scan`): how sure the
 * model was, the draft in the shared transaction form (payee, date,
 * amount, category, account, payer) and, for a receipt with two or more
 * lines, "Split by lines": the printed lines in the shared ReviewList, each
 * with its category (tap to change it), merged, dropped or recategorised
 * from the bulk bar; the last line takes the difference to the total.
 * "Save" posts it as a receipt expense; the close button discards the
 * draft after a confirmation.
 */
@Component({
  selector: 'app-receipt-review',
  providers: [ReceiptReviewStore],
  imports: [
    BannerComponent,
    BulkBarComponent,
    ButtonComponent,
    CheckboxComponent,
    IconButtonComponent,
    IconComponent,
    ReceiptLineItemComponent,
    ReviewListComponent,
    ReviewRowDirective,
    SkeletonComponent,
    TransactionFormComponent,
    TranslocoPipe,
  ],
  template: `
    <header class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-1 bg-surface-0 pr-4 pl-1">
      <button
        appIconButton
        type="button"
        icon="x"
        data-testid="scan.review.discard"
        [label]="'scan.review.discard' | transloco"
        (click)="discard()"
      ></button>
      <h1 class="truncate text-title text-ink-1">{{ 'scan.review.title' | transloco }}</h1>
    </header>

    <main class="flex flex-1 flex-col gap-6 pt-2 pb-40" data-testid="scan.review">
      @switch (store.loadState()) {
        @case ('loading') {
          <div class="flex flex-col gap-4 px-4" role="status">
            <span class="sr-only">{{ 'scan.review.loading' | transloco }}</span>
            <app-skeleton height="56px" />
            <app-skeleton width="50%" height="48px" />
            <app-skeleton height="136px" />
          </div>
        }
        @case ('error') {
          <app-banner
            class="mx-4"
            status="critical"
            data-testid="scan.review.loadError"
            [message]="'scan.review.loadError' | transloco"
            [actionLabel]="'errors.retry' | transloco"
            (action)="store.retry()"
          />
        }
        @default {
          <p
            class="mx-4 flex items-start gap-3 rounded-lg bg-surface-2 p-4 text-body text-ink-1"
            data-testid="scan.review.confidence"
            [attr.data-level]="store.confidence()"
          >
            <app-icon
              class="mt-0.5 shrink-0"
              [name]="confidenceIcon()"
              [class]="confidenceClass()"
            />
            <span>{{ 'scan.review.confidence.' + store.confidence() | transloco }}</span>
          </p>

          <app-transaction-form
            [today]="store.today()"
            [accounts]="accountOptions()"
            [people]="peopleOptions()"
            [categories]="categoryOptions()"
            [serverErrors]="store.fieldErrors()"
            [splitCount]="store.splitByLines() ? store.lines().length : 0"
            [(draft)]="store.entry"
            (splitRequested)="showLines()"
          />

          @if (store.canSplit()) {
            <app-checkbox
              class="px-4"
              data-testid="scan.review.split"
              [checked]="store.splitByLines()"
              (checkedChange)="store.toggleSplit($event)"
            >
              {{ 'scan.review.split' | transloco }}
              <span class="block text-caption text-ink-3">{{
                'scan.review.splitHint' | transloco
              }}</span>
            </app-checkbox>
          }

          @if (store.splitByLines()) {
            <section #linesSection class="flex flex-col gap-2" data-testid="scan.review.lines">
              <h2 class="px-4 text-heading text-ink-1">{{ 'scan.review.lines' | transloco }}</h2>
              @for (issue of store.issues(); track issue) {
                <p
                  class="mx-4 flex items-start gap-1.5 text-label text-status-critical"
                  data-testid="scan.review.issue"
                  [attr.data-issue]="issue"
                >
                  <app-icon name="circle-alert" class="shrink-0" [size]="16" />
                  {{ 'scan.review.issue.' + issue | transloco }}
                </p>
              } @empty {
                @if (store.differenceCents() !== 0) {
                  <p class="px-4 text-caption text-ink-2" data-testid="scan.review.difference">
                    {{ 'scan.review.difference' | transloco: { amount: differenceText() } }}
                  </p>
                }
              }
              <app-review-list
                data-testid="scan.review.list"
                [items]="lineViews()"
                [key]="keyOf"
                [label]="'scan.review.lines' | transloco"
                [checkLabel]="checkLabelOf()"
                [selectAllLabel]="'scan.review.selectAll' | transloco"
                [selected]="store.selection()"
                (selectedChange)="store.selection.set($event)"
              >
                <ng-template appReviewRow [appReviewRowOf]="lineViews()" let-row>
                  <app-receipt-line-item [line]="row" (opened)="chooseLineCategory(row.id)" />
                </ng-template>
              </app-review-list>
            </section>
          }
        }
      }
    </main>

    @if (store.selection().size > 0) {
      <app-bulk-bar
        data-testid="scan.review.bulk"
        [label]="'scan.review.bulk.label' | transloco"
        [clearLabel]="'scan.review.bulk.clear' | transloco"
        [countLabel]="'scan.review.selected' | transloco: { count: store.selection().size }"
        (cleared)="store.selection.set(emptySelection)"
      >
        <button
          bulkAside
          appButton
          variant="ghost"
          type="button"
          class="-mr-3"
          data-testid="scan.review.bulk.drop"
          (click)="store.dropSelected()"
        >
          {{ 'scan.review.bulk.drop' | transloco }}
        </button>
        <button
          appButton
          variant="secondary"
          type="button"
          data-testid="scan.review.bulk.category"
          (click)="categorizeSelected()"
        >
          {{ 'scan.review.bulk.category' | transloco }}
        </button>
        <button
          appButton
          type="button"
          icon="merge"
          data-testid="scan.review.bulk.merge"
          [disabled]="store.selection().size < 2"
          (click)="store.mergeSelected()"
        >
          {{ 'scan.review.bulk.merge' | transloco }}
        </button>
      </app-bulk-bar>
    } @else if (store.loadState() === 'ready') {
      <footer class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface-0">
        <div class="mx-auto max-w-app px-4 pt-3 pb-[max(16px,var(--safe-bottom))]">
          <button
            appButton
            type="button"
            size="block"
            data-testid="scan.review.save"
            [disabled]="!store.canSave()"
            [loading]="store.saving()"
            (click)="save()"
          >
            {{ 'scan.review.save' | transloco: { amount: saveAmount() } }}
          </button>
        </div>
      </footer>
    }
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export class ReceiptReviewComponent {
  protected readonly store = inject(ReceiptReviewStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly locale = inject(APP_LOCALE)

  readonly receipt = input.required<ReceiptDraft>()
  /** The receipt is in the ledger. */
  readonly saved = output<void>()
  /** The person dropped the draft (back to the capture). */
  readonly discarded = output<void>()

  protected readonly emptySelection: ReadonlySet<ReviewKey> = new Set()
  private readonly linesSection = viewChild<ElementRef<HTMLElement>>('linesSection')
  private readonly peopleLabels = translateSignal(PEOPLE_KEYS)

  protected readonly confidenceIcon = computed(() => CONFIDENCE_ICON[this.store.confidence()])
  protected readonly confidenceClass = computed(() => CONFIDENCE_CLASS[this.store.confidence()])

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

  protected readonly lineViews = computed<ReceiptLineView[]>(() => {
    // The people labels resolve once the scope is in; the category words follow it.
    this.peopleLabels()
    const settled = this.store.settled()
    const difference = this.store.differenceCents()
    return settled.map((line, index) => {
      const entry = this.store.directory.category(line.categoryId)
      return {
        id: line.id,
        description: line.description,
        amountCents: line.amountCents,
        quantity: line.quantity,
        categoryName: entry?.category.name ?? this.t('scan.review.uncategorized'),
        categoryIcon: entry ? categoryIcon(entry.category) : 'circle-dashed',
        adjusted: index === settled.length - 1 && difference !== 0,
      }
    })
  })

  protected readonly keyOf = (line: ReceiptLineView): ReviewKey => line.id

  protected readonly checkLabelOf = computed(() => {
    this.peopleLabels()
    const locale = this.locale()
    return (line: ReceiptLineView) =>
      this.t('scan.review.check', {
        description: line.description,
        amount: formatTransactionAmount(line.amountCents, 'expense', locale),
      })
  })

  protected readonly differenceText = computed(() =>
    formatMoney(this.store.differenceCents(), this.locale())
  )

  protected readonly saveAmount = computed(() =>
    formatTransactionAmount(this.store.signedCents(), this.store.entry().kind, this.locale())
  )

  constructor() {
    effect(() => {
      const receipt = this.receipt()
      untracked(() => void this.store.start(receipt))
    })
  }

  protected async save(): Promise<void> {
    if (await this.store.save()) {
      this.saved.emit()
    }
  }

  protected discard(): void {
    openConfirmSheet(this.sheets, {
      title: this.t('scan.review.discardSheet.title'),
      body: this.t('scan.review.discardSheet.body'),
      confirmLabel: this.t('scan.review.discardSheet.confirm'),
      cancelLabel: this.t('scan.review.discardSheet.keep'),
      destructive: true,
    }).subscribe((confirmed) => {
      if (confirmed) {
        this.discarded.emit()
      }
    })
  }

  /** The form's "Split · N" chip brings the lines into view. */
  protected showLines(): void {
    this.linesSection()?.nativeElement.scrollIntoView({ block: 'start' })
  }

  protected chooseLineCategory(id: number): void {
    const line = this.store.lines().find((item) => item.id === id)
    this.pickCategory(line?.categoryId ?? null, (categoryId) =>
      this.store.setLineCategory(id, categoryId)
    )
  }

  protected categorizeSelected(): void {
    this.pickCategory(null, (categoryId) => this.store.categorizeSelected(categoryId))
  }

  private pickCategory(selected: number | null, apply: (categoryId: number | null) => void): void {
    const options: SelectOption<number | null>[] = [
      { value: null, label: this.t('scan.review.uncategorized'), icon: 'circle-dashed' },
      ...this.store.directory.categoriesOf('expense').map(({ category, group }) => ({
        value: category.id,
        label: category.name,
        meta: group.name,
        icon: categoryIcon(category),
      })),
    ]
    openSelectSheet(this.sheets, {
      title: this.t('scan.review.lineCategory'),
      options,
      selected,
    }).subscribe((categoryId) => {
      if (categoryId !== undefined) {
        apply(categoryId)
      }
    })
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.transloco.translate(key, params)
  }
}
