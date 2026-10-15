import { Component, Injector, computed, effect, inject, input, untracked } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import { formatDateRange } from '../../../domain/dates'
import { acceptChange, type ReviewFilter } from '../../../domain/import-row'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import { BulkBarComponent } from '../../../shared/review/bulk-bar.component'
import {
  ReviewListComponent,
  type ReviewKey,
  type RowEmphasis,
} from '../../../shared/review/review-list.component'
import { ReviewRowDirective } from '../../../shared/review/review-row.directive'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { openConfirmSheet } from '../../../shared/ui/confirm-sheet/confirm-sheet.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { ProgressTrackComponent } from '../../../shared/ui/progress-track/progress-track.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../../shared/ui/segmented-control/segmented-control.component'
import { openSelectSheet } from '../../../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { ToastOutletComponent } from '../../../layouts/toast-outlet/toast-outlet.component'
import { ImportReviewStore } from '../import-review.store'
import { provideImportScope } from '../import.scope'
import { ImportRowItemComponent } from '../ui/import-row-item.component'
import { ImportRowSheetComponent, type ImportRowSheetData } from '../ui/import-row.sheet'
import { importRowView, type ImportRowView } from '../ui/import-row.view'
import { importRowContext } from '../ui/import-words'

/**
 * Keys read from TypeScript:
 * t(import.review.filter.all, import.review.filter.doubtful, import.review.filter.new)
 * t(import.review.filter.ignored, import.review.selected, import.review.categoryTitle)
 * t(import.review.cancelSheet.title, import.review.cancelSheet.body)
 * t(import.review.cancelSheet.confirm, import.review.cancelSheet.keep, import.review.rows)
 */
const KEYS = {
  selected: 'import.review.selected',
  categoryTitle: 'import.review.categoryTitle',
}

/** A key of this scope, read only to know when the catalogue is in: t(import.review.title) */
const CATALOGUE_PROBE = 'review.title'

/**
 * Review an import `/import/:id` (DESIGN mock `import-review`): the batch
 * (account, dates, rows) and its summary by state, a filter (all · to
 * review · new · ignored), the rows in the shared ReviewList (auto rows
 * quiet, doubtful ones raised with their suggestion and "Accept", new ones
 * marked) and, per row, the triage sheet. Ticking rows brings the bulk bar
 * (ignore, assign a category, accept suggested); otherwise the bottom holds
 * "Accept suggested" and "Confirm import", which waits while a row still
 * needs a decision. "Classify with AI" asks the model and follows its run.
 */
@Component({
  selector: 'app-import-review-page',
  imports: [
    BulkBarComponent,
    ButtonComponent,
    EmptyStateComponent,
    IconButtonComponent,
    IconComponent,
    ImportRowItemComponent,
    ProgressTrackComponent,
    ReviewListComponent,
    ReviewRowDirective,
    RouterLink,
    SegmentedControlComponent,
    SkeletonComponent,
    ToastOutletComponent,
    TranslocoPipe,
  ],
  providers: [ImportReviewStore, provideImportScope()],
  template: `
    <div
      class="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-surface-0 pt-safe text-ink-1"
      data-testid="import.review"
    >
      <header class="sticky top-0 z-10 flex flex-col gap-3 bg-surface-0 pb-3">
        <div class="flex min-h-14 items-center gap-1 pr-1 pl-1">
          <a
            appIconButton
            icon="arrow-left"
            routerLink="/import"
            [label]="'import.review.back' | transloco"
          ></a>
          <div class="flex min-w-0 flex-1 flex-col py-1">
            <h1 class="truncate text-title text-ink-1">{{ 'import.review.title' | transloco }}</h1>
            @if (subtitle()) {
              <p class="truncate text-caption text-ink-2" data-testid="import.review.subtitle">
                {{ subtitle() }}
              </p>
            }
          </div>
          @if (store.isStaged()) {
            <button
              appButton
              variant="ghost"
              type="button"
              data-testid="import.review.cancel"
              [loading]="store.cancelling()"
              (click)="cancelImport()"
            >
              {{ 'import.review.cancel' | transloco }}
            </button>
          }
        </div>

        @if (store.status() === 'ready' && store.isStaged()) {
          <app-segmented-control
            class="mx-4"
            data-testid="import.review.filter"
            [label]="'import.review.filter.label' | transloco"
            [options]="filterOptions()"
            [value]="store.filter()"
            (valueChange)="setFilter($event)"
          />
        }
      </header>
      <app-toast-outlet class="fixed inset-x-0 top-[calc(var(--safe-top)+56px)] z-20" />

      <main class="flex-1 pb-48">
        @if (store.status() === 'ready' && store.isStaged()) {
          <ul
            class="mx-4 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-2 px-4 py-2.5 text-label text-ink-1"
            data-testid="import.review.summary"
            [attr.aria-label]="'import.review.summaryLabel' | transloco"
          >
            @for (chip of summaryChips(); track chip.tone) {
              <li class="flex items-center gap-1 tnum" [attr.data-tone]="chip.tone">
                @if (chip.tone === 'doubtful' && chip.count > 0) {
                  <app-icon name="triangle-alert" [size]="16" class="text-status-warning" />
                }
                {{ chip.label }}
              </li>
            }
          </ul>
          @if (store.blocking().length > 0) {
            <p
              class="mx-4 mb-2 flex items-center gap-2 text-label text-ink-1"
              role="status"
              data-testid="import.review.blocking"
            >
              <app-icon name="triangle-alert" [size]="16" class="shrink-0 text-status-warning" />
              <span class="min-w-0 flex-1">{{
                'import.review.blocking' | transloco: { count: store.blocking().length }
              }}</span>
              @if (store.filter() !== 'doubtful') {
                <button
                  type="button"
                  class="-my-3 h-11 shrink-0 rounded-md px-2 text-label font-semibold text-accent active:bg-surface-2"
                  data-testid="import.review.showBlocking"
                  (click)="setFilter('doubtful')"
                >
                  {{ 'import.review.showBlocking' | transloco }}
                </button>
              }
            </p>
          }
          @if (store.classifiable() > 0 || store.classifying()) {
            <div class="mx-4 flex flex-col items-start gap-1">
              <button
                appButton
                variant="link"
                type="button"
                icon="sparkles"
                class="-ml-3"
                data-testid="import.review.classify"
                [loading]="store.classifying()"
                (click)="store.classify()"
              >
                {{
                  (store.classifying() ? 'import.review.classifying' : 'import.review.classify')
                    | transloco: { count: store.classifiable() }
                }}
              </button>
              @if (store.classifying()) {
                <app-progress-track
                  class="w-full"
                  [value]="null"
                  [label]="'import.review.classifying' | transloco: { count: store.classifiable() }"
                />
              }
            </div>
          }
        }
        @switch (store.status()) {
          @case ('loading') {
            <div class="flex flex-col gap-2 px-4 pt-2" role="status">
              <span class="sr-only">{{ 'import.review.loading' | transloco }}</span>
              <app-skeleton height="44px" />
              @for (item of [1, 2, 3, 4, 5, 6]; track item) {
                <app-skeleton height="56px" />
              }
            </div>
          }
          @case ('error') {
            <app-empty-state
              icon="wifi-off"
              data-testid="import.review.error"
              [title]="'import.review.error.title' | transloco"
              [body]="store.loadFailure()?.key ?? 'errors.server' | transloco"
            >
              <button
                appButton
                type="button"
                variant="secondary"
                icon="refresh-cw"
                (click)="store.retry()"
              >
                {{ 'errors.retry' | transloco }}
              </button>
            </app-empty-state>
          }
          @default {
            @if (!store.isStaged()) {
              <app-empty-state
                icon="archive"
                data-testid="import.review.closed"
                [title]="'import.review.closed.title' | transloco"
                [body]="'import.review.closed.body' | transloco"
              >
                <a appButton variant="secondary" icon="file-up" routerLink="/import">
                  {{ 'import.review.closed.action' | transloco }}
                </a>
              </app-empty-state>
            } @else if (views().length === 0) {
              <app-empty-state
                icon="inbox"
                data-testid="import.review.empty"
                [title]="'import.review.empty.title' | transloco"
                [body]="'import.review.empty.body' | transloco"
              >
                <button appButton type="button" variant="secondary" (click)="setFilter('all')">
                  {{ 'import.review.empty.action' | transloco }}
                </button>
              </app-empty-state>
            } @else {
              <app-review-list
                data-testid="import.review.list"
                [items]="views()"
                [key]="keyOf"
                [label]="'import.review.listLabel' | transloco"
                [checkLabel]="checkLabelOf"
                [selectable]="selectableOf"
                [emphasis]="emphasisOf"
                [selectAllLabel]="'import.review.selectAll' | transloco"
                [moreLabel]="'import.review.more' | transloco"
                [selected]="store.selection()"
                (selectedChange)="store.selection.set($event)"
              >
                <ng-template appReviewRow [appReviewRowOf]="views()" let-row>
                  <app-import-row-item
                    [view]="row"
                    [pending]="store.pending().has(row.id)"
                    (opened)="open(row.id)"
                    (accepted)="accept(row.id)"
                    (changed)="open(row.id)"
                  />
                </ng-template>
              </app-review-list>
            }
          }
        }
      </main>

      @if (store.status() === 'ready' && store.isStaged()) {
        @if (store.selection().size > 0) {
          <app-bulk-bar
            data-testid="import.review.bulk"
            [label]="'import.review.bulk.label' | transloco"
            [clearLabel]="'import.review.bulk.clear' | transloco"
            [countLabel]="'import.review.selected' | transloco: { count: store.selection().size }"
            (cleared)="store.clearSelection()"
          >
            <button
              bulkAside
              appButton
              variant="ghost"
              type="button"
              class="-mr-3"
              data-testid="import.review.bulk.ignore"
              [disabled]="store.bulkBusy()"
              (click)="store.ignoreSelected()"
            >
              {{ 'import.review.bulk.ignore' | transloco }}
            </button>
            <button
              appButton
              variant="secondary"
              type="button"
              data-testid="import.review.bulk.category"
              [disabled]="store.bulkBusy()"
              (click)="assignCategory()"
            >
              {{ 'import.review.bulk.category' | transloco }}
            </button>
            <button
              appButton
              type="button"
              data-testid="import.review.bulk.accept"
              [disabled]="selectedAcceptable() === 0"
              [loading]="store.bulkBusy()"
              (click)="store.acceptSuggested()"
            >
              {{ 'import.review.bulk.accept' | transloco: { count: selectedAcceptable() } }}
            </button>
          </app-bulk-bar>
        } @else {
          <footer
            class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface-1 pb-safe shadow-2"
            data-testid="import.review.footer"
          >
            <div class="mx-auto flex max-w-app flex-col gap-2 px-4 pt-3 pb-4">
              @if (store.summary().acceptable > 0) {
                <button
                  appButton
                  variant="secondary"
                  type="button"
                  data-testid="import.review.acceptAll"
                  [loading]="store.bulkBusy()"
                  (click)="store.acceptSuggested()"
                >
                  {{ 'import.review.acceptAll' | transloco: { count: store.summary().acceptable } }}
                </button>
              }
              <button
                appButton
                type="button"
                size="block"
                data-testid="import.review.confirm"
                [disabled]="!store.canConfirm()"
                [loading]="store.confirming()"
                (click)="confirm()"
              >
                {{ 'import.review.confirm' | transloco: { count: store.summary().total } }}
              </button>
            </div>
          </footer>
        }
      }
    </div>
  `,
})
export default class ImportReviewPage {
  /** Route param `:id` (component input binding). */
  readonly id = input.required<string>()

  protected readonly store = inject(ImportReviewStore)
  private readonly router = inject(Router)
  private readonly sheets = inject(BottomSheetService)
  private readonly injector = inject(Injector)
  private readonly transloco = inject(TranslocoService)
  private readonly locale = inject(APP_LOCALE)
  /** Changes once the catalogue is in; computed wording depends on it. */
  private readonly catalogue = translateSignal(CATALOGUE_PROBE)
  private readonly t = (key: string, params?: Record<string, string | number>): string =>
    this.transloco.translate(key, params)

  private readonly context = computed(() => {
    this.catalogue()
    return importRowContext(this.t, this.locale(), this.store.directory)
  })

  protected readonly views = computed<ImportRowView[]>(() => {
    const context = this.context()
    return this.store.visibleRows().map((row) => importRowView(row, context))
  })

  protected readonly subtitle = computed(() => {
    this.catalogue()
    const batch = this.store.batch()
    if (!batch) {
      return ''
    }
    const account = this.store.directory.account(batch.accountId)?.name ?? ''
    const locale = this.locale()
    const dates =
      batch.dateFrom && batch.dateTo ? formatDateRange(batch.dateFrom, batch.dateTo, locale) : ''
    const rows = this.t('import.review.rows', { count: batch.counts.rows })
    return [account, dates, rows].filter(Boolean).join(' · ')
  })

  protected readonly summaryChips = computed(() => {
    this.catalogue()
    const summary = this.store.summary()
    const chips = [
      { tone: 'auto', count: summary.auto, always: true },
      { tone: 'doubtful', count: summary.doubtful, always: true },
      { tone: 'new', count: summary.new, always: true },
      { tone: 'duplicate', count: summary.duplicate, always: true },
      { tone: 'transfer', count: summary.transfer, always: false },
      { tone: 'ignored', count: summary.ignored, always: false },
    ]
    /**
     * t(import.review.summary.auto, import.review.summary.doubtful, import.review.summary.new)
     * t(import.review.summary.duplicate, import.review.summary.transfer)
     * t(import.review.summary.ignored)
     */
    return chips
      .filter((chip) => chip.always || chip.count > 0)
      .map((chip) => ({
        tone: chip.tone,
        count: chip.count,
        label: this.t(`import.review.summary.${chip.tone}`, { count: chip.count }),
      }))
  })

  protected readonly filterOptions = computed<SegmentOption<ReviewFilter>[]>(() => {
    this.catalogue()
    // Four options fill the 358px track: the counts live in the summary above.
    return [
      { value: 'all', label: this.t('import.review.filter.all') },
      { value: 'doubtful', label: this.t('import.review.filter.doubtful') },
      { value: 'new', label: this.t('import.review.filter.new') },
      { value: 'ignored', label: this.t('import.review.filter.ignored') },
    ]
  })

  /** Selected rows that "Accept suggested" would change. */
  protected readonly selectedAcceptable = computed(
    () => this.store.selectedRows().filter((row) => acceptChange(row) !== null).length
  )

  protected readonly keyOf = (view: ImportRowView): ReviewKey => view.id
  protected readonly checkLabelOf = (view: ImportRowView): string => view.checkLabel
  protected readonly selectableOf = (view: ImportRowView): boolean => view.selectable
  protected readonly emphasisOf = (view: ImportRowView): RowEmphasis =>
    view.tone === 'doubtful' ? 'raised' : 'rest'

  constructor() {
    effect(() => {
      const id = Number(this.id())
      untracked(() => void this.store.load(id))
    })
    // A batch confirmed elsewhere (or by this screen) shows its result.
    effect(() => {
      const batch = this.store.batch()
      if (batch?.status === 'completed' && !untracked(() => this.store.confirming())) {
        untracked(() => void this.router.navigate(['/import', batch.id, 'result']))
      }
    })
  }

  protected setFilter(filter: ReviewFilter): void {
    this.store.filter.set(filter)
  }

  protected open(rowId: number): void {
    this.sheets.open<void, ImportRowSheetData>(ImportRowSheetComponent, {
      data: { rowId },
      injector: this.injector,
    })
  }

  protected accept(rowId: number): void {
    const row = this.store.rows().find((item) => item.id === rowId)
    const change = row ? acceptChange(row) : null
    if (change) {
      void this.store.decide(rowId, change)
    }
  }

  protected assignCategory(): void {
    const options = [
      ...this.store.directory.categoriesOf('expense'),
      ...this.store.directory.categoriesOf('income'),
    ].map(({ category, group }) => ({
      value: category.id,
      label: category.name,
      meta: group.name,
      icon: categoryIcon(category),
    }))
    openSelectSheet(this.sheets, { title: this.t(KEYS.categoryTitle), options }).subscribe(
      (categoryId) => {
        if (categoryId !== undefined) {
          void this.store.assignCategory(categoryId)
        }
      }
    )
  }

  protected async confirm(): Promise<void> {
    const result = await this.store.confirm()
    if (result) {
      await this.router.navigate(['/import', result.batchId, 'result'])
    }
  }

  protected cancelImport(): void {
    openConfirmSheet(this.sheets, {
      title: this.t('import.review.cancelSheet.title'),
      body: this.t('import.review.cancelSheet.body'),
      confirmLabel: this.t('import.review.cancelSheet.confirm'),
      cancelLabel: this.t('import.review.cancelSheet.keep'),
      destructive: true,
    }).subscribe(async (confirmed) => {
      if (confirmed && (await this.store.cancel())) {
        await this.router.navigate(['/import'])
      }
    })
  }
}
