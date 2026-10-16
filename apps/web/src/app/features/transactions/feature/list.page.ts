import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import { distinctUntilChanged, filter, map } from 'rxjs'
import type { Transaction } from '../../../core/api/api-types'
import { TagsStore } from '../../../core/ledger/tags.store'
import { HOUSEHOLD_TIME_ZONE } from '../../../core/platform/time-zone.token'
import { formatWeekdayDate } from '../../../domain/dates'
import {
  addMonths,
  label as monthLabel,
  todayIn,
  yearOf,
  type YearMonth,
} from '../../../domain/month'
import type { CategoryFilter, PayerFilter } from '../../../domain/transaction-filters'
import { relativeDay, type ListItem } from '../../../domain/transaction-list'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import type { Person } from '../../../shared/ui/person-dot/person-dot.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../../../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import { TransactionsStore } from '../transactions.store'
import { provideTransactionsScope } from '../transactions.scope'
import { DayHeaderComponent } from '../ui/day-header.component'
import {
  FiltersBarComponent,
  type FilterChipView,
  type FilterId,
} from '../ui/filters-bar.component'
import { TransactionRowComponent } from '../ui/transaction-row.component'
import { rowView, type RowContext, type TransactionRowView } from '../ui/transaction-row.view'

/** Search waits this long after the last keystroke. */
const SEARCH_DEBOUNCE_MS = 300
/** Months offered by the month filter, counting back from this one. */
const MONTHS_BACK = 24

type RowAction = 'edit' | 'duplicate' | 'delete'

/**
 * Keys read from TypeScript. translateSignal() takes them relative to this
 * page's scope:
 * t(transactions.row.private, transactions.row.uncategorized, transactions.row.split)
 * t(transactions.row.transfer, transactions.row.noPayee, transactions.people.you)
 * t(transactions.people.joint, transactions.filters.allAccounts, transactions.filters.everyone)
 * t(transactions.filters.category, transactions.filters.uncategorized)
 * t(transactions.filters.allCategories, transactions.filters.tag, transactions.filters.allTags)
 * t(transactions.filters.allMonths)
 * Full keys translated on demand:
 * t(transactions.row.transferFrom, transactions.row.transferTo, transactions.day.today)
 * t(transactions.day.yesterday, transactions.filters.monthTitle, transactions.filters.accountTitle)
 * t(transactions.filters.personTitle, transactions.filters.categoryTitle, transactions.actions.title)
 * t(transactions.actions.edit, transactions.actions.duplicate, transactions.actions.delete)
 * t(transactions.filters.tagTitle, transactions.filters.tagCount, transactions.filters.noTags)
 */
const WORD_KEYS = [
  'row.private',
  'row.uncategorized',
  'row.split',
  'row.transfer',
  'row.noPayee',
  'people.you',
  'people.joint',
  'filters.allAccounts',
  'filters.everyone',
  'filters.category',
  'filters.uncategorized',
  'filters.allCategories',
  'filters.tag',
  'filters.allTags',
  'filters.allMonths',
]
const KEYS = {
  transferFrom: 'transactions.row.transferFrom',
  transferTo: 'transactions.row.transferTo',
  today: 'transactions.day.today',
  yesterday: 'transactions.day.yesterday',
  monthTitle: 'transactions.filters.monthTitle',
  accountTitle: 'transactions.filters.accountTitle',
  personTitle: 'transactions.filters.personTitle',
  categoryTitle: 'transactions.filters.categoryTitle',
  actionsTitle: 'transactions.actions.title',
  edit: 'transactions.actions.edit',
  duplicate: 'transactions.actions.duplicate',
  delete: 'transactions.actions.delete',
  tagTitle: 'transactions.filters.tagTitle',
  tagCount: 'transactions.filters.tagCount',
  noTags: 'transactions.filters.noTags',
}

/** The month sheet's extra option while a tag spans every month. */
const ALL_MONTHS = 'all'

interface DayView {
  date: string
  label: string
  subtotalCents: number
  showSubtotal: boolean
  rows: { view: TransactionRowView; row: Transaction }[]
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

/**
 * Transactions (plan, screen 9; mock `transactions`): filter chips (month ·
 * account · person · category · tag) and search, then a dense list of 56px rows
 * grouped by day with a subtotal, "load more" at the end. Tap opens the
 * sheet (`/transactions/:id`, the child route), long-press offers edit,
 * duplicate and delete (with "Undo"). Honest empty states: nothing this
 * month, or nothing that matches the filters. A tag filter (the chip, or
 * `?tag=` from the tags screen) spans every month until one is picked.
 */
@Component({
  selector: 'app-transactions-page',
  imports: [
    ButtonComponent,
    DayHeaderComponent,
    EmptyStateComponent,
    FiltersBarComponent,
    IconButtonComponent,
    RouterLink,
    RouterOutlet,
    SkeletonComponent,
    TextFieldComponent,
    TransactionRowComponent,
    TranslocoPipe,
  ],
  providers: [TransactionsStore, provideTransactionsScope()],
  template: `
    <div
      #top
      class="sticky top-[var(--safe-top)] z-10 border-b border-line bg-surface-0"
      data-testid="transactions.header"
    >
      <header class="flex h-14 items-center justify-between gap-2 pr-1 pl-4">
        <h1 class="truncate text-title text-ink-1">{{ 'transactions.title' | transloco }}</h1>
        <button
          appIconButton
          type="button"
          data-testid="transactions.search.toggle"
          [icon]="searchOpen() ? 'x' : 'search'"
          [label]="
            (searchOpen() ? 'transactions.search.close' : 'transactions.search.open') | transloco
          "
          [attr.aria-expanded]="searchOpen()"
          (click)="toggleSearch()"
        ></button>
      </header>
      @if (searchOpen()) {
        <app-text-field
          class="px-4 pb-2"
          type="search"
          autocomplete="off"
          data-testid="transactions.search"
          [label]="'transactions.search.label' | transloco"
          [(value)]="searchText"
        />
      }
      <app-filters-bar
        [label]="'transactions.filters.label' | transloco"
        [chips]="chips()"
        [clearLabel]="store.hasNarrowingFilters() ? ('transactions.filters.clear' | transloco) : ''"
        (opened)="openFilter($event)"
        (cleared)="clearFilters()"
      />
    </div>

    @if (store.firstLoad()) {
      <div class="flex flex-col gap-2 px-4 pt-4" aria-hidden="true">
        <app-skeleton height="16px" width="40%" />
        @for (item of [1, 2, 3, 4, 5]; track item) {
          <app-skeleton height="56px" />
        }
      </div>
    } @else if (store.failed() && store.rows().length === 0) {
      <app-empty-state
        icon="wifi-off"
        data-testid="transactions.error"
        [title]="'transactions.error.title' | transloco"
        [body]="'transactions.error.body' | transloco"
      >
        <button
          appButton
          type="button"
          variant="secondary"
          icon="refresh-cw"
          (click)="store.retry()"
        >
          {{ 'transactions.error.retry' | transloco }}
        </button>
      </app-empty-state>
    } @else if (days().length === 0) {
      @if (store.hasNarrowingFilters()) {
        <app-empty-state
          icon="search"
          data-testid="transactions.filtered"
          [title]="'transactions.filtered.title' | transloco"
          [body]="'transactions.filtered.body' | transloco"
        >
          <button appButton type="button" variant="secondary" (click)="clearFilters()">
            {{ 'transactions.filtered.action' | transloco }}
          </button>
        </app-empty-state>
      } @else {
        <app-empty-state
          icon="receipt"
          data-testid="transactions.empty"
          [title]="'transactions.empty.title' | transloco: { month: monthName() }"
          [body]="'transactions.empty.body' | transloco"
        >
          <a appButton variant="secondary" icon="plus" routerLink="/add">
            {{ 'transactions.empty.action' | transloco }}
          </a>
        </app-empty-state>
      }
    } @else {
      <div
        class="pb-6 transition-opacity"
        data-testid="transactions.list"
        [class.opacity-60]="store.refreshing()"
        [attr.aria-busy]="store.refreshing() || null"
      >
        @for (day of days(); track day.date) {
          <section [attr.aria-label]="day.label" data-testid="transactions.day">
            <app-day-header
              [label]="day.label"
              [subtotalCents]="day.subtotalCents"
              [showSubtotal]="day.showSubtotal"
            />
            <div role="list">
              @for (item of day.rows; track item.view.key) {
                <app-transaction-row
                  [view]="item.view"
                  (opened)="open(item.view.id)"
                  (held)="actions(item.row)"
                />
              }
            </div>
          </section>
        }
        @if (store.hasMore()) {
          <div class="flex justify-center px-4 pt-4">
            <button
              appButton
              type="button"
              variant="secondary"
              data-testid="transactions.loadMore"
              [loading]="store.loadingMore()"
              (click)="store.loadMore()"
            >
              {{ 'transactions.list.loadMore' | transloco }}
            </button>
          </div>
        }
      </div>
    }

    <router-outlet />
  `,
  host: { 'class': 'block', '[style.--day-header-top]': 'stickyTop()' },
})
export default class TransactionsPage {
  protected readonly store = inject(TransactionsStore)
  private readonly tags = inject(TagsStore)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly locale = inject(APP_LOCALE)
  private readonly timeZone = inject(HOUSEHOLD_TIME_ZONE)
  private readonly destroyRef = inject(DestroyRef)

  private readonly top = viewChild.required<ElementRef<HTMLElement>>('top')

  protected readonly searchOpen = signal(false)
  protected readonly searchText = signal('')
  /** Day headers stick right under the (sticky) top bar, whatever its height. */
  protected readonly stickyTop = signal('0px')

  private readonly words = translateSignal(WORD_KEYS)

  private readonly accounts = computed(() =>
    this.store.accounts.hasValue() ? this.store.accounts.value() : []
  )

  private readonly rowContext = computed<RowContext>(() => {
    const [privateLabel = '', uncategorized = '', split = '', transfer = '', noPayee = ''] =
      this.words()
    const accounts = new Map(this.accounts().map((account) => [account.id, account.name]))
    const categories = this.store.categories.byId()
    return {
      labels: {
        private: privateLabel,
        uncategorized,
        split,
        transfer,
        noPayee,
        transferFrom: (account) => this.t(KEYS.transferFrom, { account }),
        transferTo: (account) => this.t(KEYS.transferTo, { account }),
      },
      accountName: (id) => accounts.get(id) ?? '',
      category: (id) => categories.get(id),
      person: (userId) => this.store.members.personOf(userId),
      personLabel: (userId) => this.personName(userId),
    }
  })

  protected readonly days = computed<DayView[]>(() => {
    const context = this.rowContext()
    const locale = this.locale()
    const today = todayIn(this.timeZone())
    const thisYear = yearOf(this.store.currentMonth())
    return this.store.days().map((day) => {
      const date = formatWeekdayDate(day.date, locale, {
        withYear: Number(day.date.slice(0, 4)) !== thisYear,
      })
      const relative = relativeDay(day.date, today)
      return {
        date: day.date,
        label: relative ? this.t(KEYS[relative], { date }) : capitalize(date),
        subtotalCents: day.subtotalCents,
        showSubtotal: day.items.some((item) => item.type === 'entry'),
        rows: day.items.map((item) => ({ view: rowView(item, context), row: rowOf(item) })),
      }
    })
  })

  protected readonly monthName = computed(() => {
    const month = this.store.filters().month
    return month === null ? '' : this.monthText(month, false)
  })

  protected readonly chips = computed<FilterChipView[]>(() => {
    const words = this.words()
    const filters = this.store.filters()
    const account = this.accounts().find((item) => item.id === filters.accountId)
    const category =
      filters.category?.type === 'category'
        ? this.store.categories.byId().get(filters.category.id)?.name
        : filters.category?.type === 'uncategorized'
          ? words[10]
          : undefined
    const everyMonth = filters.month === null
    return [
      {
        id: 'month',
        label: everyMonth ? (words[14] ?? '') : capitalize(this.monthName()),
        active: !everyMonth,
      },
      { id: 'account', label: account?.name ?? words[7] ?? '', active: filters.accountId !== null },
      {
        id: 'person',
        label:
          filters.paidBy === null
            ? (words[8] ?? '')
            : filters.paidBy === 'joint'
              ? (words[6] ?? '')
              : this.personName(filters.paidBy),
        active: filters.paidBy !== null,
      },
      { id: 'category', label: category ?? words[9] ?? '', active: filters.category !== null },
      { id: 'tag', label: filters.tag ?? words[12] ?? '', active: filters.tag !== null },
    ]
  })

  constructor() {
    void this.tags.load()
    // `?tag=` (from the tags screen) opens the list filtered by that tag.
    this.route.queryParamMap
      .pipe(
        map((params) => params.get('tag')),
        filter((tag): tag is string => !!tag),
        distinctUntilChanged(),
        takeUntilDestroyed()
      )
      .subscribe((tag) => this.store.setTag(tag))

    // Debounced search: the list reloads once typing pauses.
    effect((onCleanup) => {
      const text = this.searchText()
      const timer = setTimeout(
        () => untracked(() => this.store.setSearch(text)),
        SEARCH_DEBOUNCE_MS
      )
      onCleanup(() => clearTimeout(timer))
    })

    afterNextRender(() => {
      const element = this.top().nativeElement
      const measure = () => this.stickyTop.set(`calc(var(--safe-top) + ${element.offsetHeight}px)`)
      measure()
      if (typeof ResizeObserver === 'undefined') {
        return
      }
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      this.destroyRef.onDestroy(() => observer.disconnect())
    })
  }

  protected toggleSearch(): void {
    if (this.searchOpen()) {
      this.searchText.set('')
      this.store.setSearch('')
    }
    this.searchOpen.update((open) => !open)
  }

  protected clearFilters(): void {
    this.searchText.set('')
    this.searchOpen.set(false)
    this.store.clearFilters()
  }

  protected open(id: number): void {
    void this.router.navigate([id], { relativeTo: this.route })
  }

  protected openFilter(id: FilterId): void {
    switch (id) {
      case 'month':
        return this.chooseMonth()
      case 'account':
        return this.chooseAccount()
      case 'person':
        return this.choosePerson()
      case 'category':
        return this.chooseCategory()
      case 'tag':
        return void this.chooseTag()
    }
  }

  protected actions(row: Transaction): void {
    if (row.isMasked) {
      this.open(row.id)
      return
    }
    const options: SelectOption<RowAction>[] = [
      { value: 'edit', label: this.t(KEYS.edit), icon: 'pencil' },
      { value: 'duplicate', label: this.t(KEYS.duplicate), icon: 'copy' },
      { value: 'delete', label: this.t(KEYS.delete), icon: 'trash-2' },
    ]
    openSelectSheet(this.sheets, {
      title: this.t(KEYS.actionsTitle),
      options,
    }).subscribe((action) => {
      if (action === 'edit') {
        this.open(row.id)
      } else if (action === 'duplicate') {
        void this.store.duplicate(row)
      } else if (action === 'delete') {
        void this.store.remove(row)
      }
    })
  }

  private chooseMonth(): void {
    const current = this.store.currentMonth()
    const filters = this.store.filters()
    const options: SelectOption<YearMonth | typeof ALL_MONTHS>[] = Array.from(
      { length: MONTHS_BACK },
      (_, index) => {
        const month = addMonths(current, -index)
        return { value: month, label: capitalize(this.monthText(month, true)) }
      }
    )
    if (filters.tag !== null) {
      options.unshift({ value: ALL_MONTHS, label: this.words()[14] ?? '', icon: 'calendar' })
    }
    openSelectSheet<YearMonth | typeof ALL_MONTHS>(this.sheets, {
      title: this.t(KEYS.monthTitle),
      options,
      selected: filters.month ?? ALL_MONTHS,
    }).subscribe((month) => {
      if (month === ALL_MONTHS) {
        this.store.showAllMonths()
      } else if (month) {
        this.store.setMonth(month)
      }
    })
  }

  /** The household's tags, most recently used first (read again if the ledger changed). */
  private async chooseTag(): Promise<void> {
    await this.tags.load()
    const words = this.words()
    const known = this.tags.tags()
    const options: SelectOption<string | null>[] = [
      {
        value: null,
        label: words[13] ?? '',
        icon: 'tag',
        ...(known.length === 0 ? { meta: this.t(KEYS.noTags) } : {}),
      },
      ...known.map((tag) => ({
        value: tag.tag as string | null,
        label: tag.tag,
        meta: this.t(KEYS.tagCount, { count: tag.count }),
      })),
    ]
    openSelectSheet(this.sheets, {
      title: this.t(KEYS.tagTitle),
      options,
      selected: this.store.filters().tag,
    }).subscribe((tag) => {
      if (tag !== undefined) {
        this.store.setTag(tag)
      }
    })
  }

  private chooseAccount(): void {
    const words = this.words()
    const options: SelectOption<number | null>[] = [
      { value: null, label: words[7] ?? '', icon: 'wallet' },
      ...this.accounts().map((account) => ({ value: account.id, label: account.name })),
    ]
    openSelectSheet(this.sheets, {
      title: this.t(KEYS.accountTitle),
      options,
      selected: this.store.filters().accountId,
    }).subscribe((accountId) => {
      if (accountId !== undefined) {
        this.store.setAccount(accountId)
      }
    })
  }

  /** Everyone, you, the partner, or what "both of us" paid. */
  private choosePerson(): void {
    const words = this.words()
    const options: SelectOption<PayerFilter | null>[] = [
      { value: null, label: words[8] ?? '', icon: 'users' },
      ...this.store.members.people().map((person) => ({
        value: person.userId as PayerFilter | null,
        label: person.isYou ? (words[5] ?? '') : person.name,
        person: person.person as Person,
      })),
      { value: 'joint', label: words[6] ?? '', person: 'joint' },
    ]
    openSelectSheet(this.sheets, {
      title: this.t(KEYS.personTitle),
      options,
      selected: this.store.filters().paidBy,
    }).subscribe((paidBy) => {
      if (paidBy !== undefined) {
        this.store.setPaidBy(paidBy)
      }
    })
  }

  private chooseCategory(): void {
    const words = this.words()
    const options: SelectOption<string>[] = [
      { value: 'all', label: words[11] ?? '', icon: 'tag' },
      { value: 'uncategorized', label: words[10] ?? '', icon: 'circle-dashed' },
      ...this.store.categories.options().map((option) => ({
        value: `c${option.id}`,
        label: option.name,
        meta: option.groupName,
        icon: categoryIcon(option),
      })),
    ]
    const filter = this.store.filters().category
    const selected =
      filter === null ? 'all' : filter.type === 'uncategorized' ? 'uncategorized' : `c${filter.id}`
    openSelectSheet(this.sheets, {
      title: this.t(KEYS.categoryTitle),
      options,
      selected,
    }).subscribe((value) => {
      if (value === undefined) {
        return
      }
      const next: CategoryFilter | null =
        value === 'all'
          ? null
          : value === 'uncategorized'
            ? { type: 'uncategorized' }
            : { type: 'category', id: Number(value.slice(1)) }
      this.store.setCategory(next)
    })
  }

  private personName(userId: number | null): string {
    const words = this.words()
    const person = this.store.members.find(userId)
    if (!person) {
      return words[6] ?? ''
    }
    return person.isYou ? (words[5] ?? '') : person.name
  }

  private monthText(month: YearMonth, alwaysYear: boolean): string {
    const withYear = alwaysYear || yearOf(month) !== yearOf(this.store.currentMonth())
    return monthLabel(month, this.locale(), { long: true, withYear })
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.transloco.translate(key, params)
  }
}

function rowOf(item: ListItem<Transaction>): Transaction {
  return item.type === 'entry' ? item.row : ((item.outgoing ?? item.incoming) as Transaction)
}
