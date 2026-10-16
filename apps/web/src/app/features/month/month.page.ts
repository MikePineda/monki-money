import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { failureMessage } from '../../core/api/error-messages'
import { toApiError } from '../../core/api/http-errors'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { RecurringApi } from '../../core/ledger/recurring.api'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import { formatDayMonth } from '../../domain/dates'
import type { ChartColor } from '../../domain/charts/colors'
import {
  groupHistories,
  monthInsights,
  sameDayHistories,
  type Insight,
} from '../../domain/insights'
import { formatMoney } from '../../domain/money'
import {
  addMonths,
  compareYearMonth,
  isYearMonth,
  label as monthLabel,
  yearOf,
  type YearMonth,
} from '../../domain/month'
import {
  spendByGroup,
  spendByPerson,
  spendDelta,
  spendTrend,
  totalsSeries,
} from '../../domain/month-view'
import { BarListComponent } from '../../shared/charts/bar-list/bar-list.component'
import {
  ChartFrameComponent,
  type ChartState,
} from '../../shared/charts/chart-frame/chart-frame.component'
import { StackedBar100Component } from '../../shared/charts/stacked-bar-100/stacked-bar-100.component'
import { StatTileSparklineComponent } from '../../shared/charts/stat-tile-sparkline/stat-tile-sparkline.component'
import { TrendLineComponent } from '../../shared/charts/trend-line/trend-line.component'
import { categoryIcon } from '../../shared/icons/category-icons'
import type { IconName } from '../../shared/icons/icon-names'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { BannerComponent } from '../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../shared/ui/button/button.component'
import { CardComponent } from '../../shared/ui/card/card.component'
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component'
import { ListRowComponent } from '../../shared/ui/list-row/list-row.component'
import { MonthPickerComponent } from '../../shared/ui/month-picker/month-picker.component'
import type { Person } from '../../shared/ui/person-dot/person-dot.component'
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component'
import { StatTileComponent } from '../../shared/ui/stat-tile/stat-tile.component'
import { provideMonthScope } from './month.scope'
import { CommittedCardComponent } from './ui/committed-card.component'
import { InsightSummaryCardComponent } from './ui/insight-summary/insight-summary-card.component'
import { MonthHeroComponent } from './ui/month-hero.component'

/**
 * Scoped keys used from TypeScript. translateSignal() adds the "month."
 * prefix itself (relative keys); keys picked at runtime are listed in full.
 * Declared for transloco-keys-manager:
 * t(month.hero.less, month.hero.more, month.hero.same)
 * t(month.hero.lessToDate, month.hero.moreToDate, month.hero.sameToDate)
 * t(month.insights.groupAboveAverage, month.insights.groupBelowAverage, month.insights.groupShare)
 * t(month.insights.groupAboveAverageToDate, month.insights.groupBelowAverageToDate)
 * t(month.insights.savedShare, month.insights.overspent)
 * t(month.insights.spendAboveAverage, month.insights.spendBelowAverage)
 * t(month.insights.spendAboveAverageToDate, month.insights.spendBelowAverageToDate)
 * t(month.spend.uncategorized, month.spend.private, month.spend.unknown, month.trend.series)
 * t(month.whoPaid.you, month.whoPaid.joint)
 * t(month.top.private, month.top.noPayee, month.top.uncategorized, month.top.split)
 * t(month.committed.found, month.committed.noneFound)
 */
const LABEL_KEYS = [
  'spend.uncategorized',
  'spend.private',
  'spend.unknown',
  'whoPaid.you',
  'whoPaid.joint',
  'trend.series',
  'top.private',
  'top.noPayee',
  'top.uncategorized',
  'top.split',
]

interface TopRow {
  id: number
  icon: IconName
  title: string
  meta: string[]
  person: Person
  amountCents: number
}

interface InsightText {
  key: string
  params: Record<string, string | number>
}

/** The chart colour of a person mark (the shared ring is muted). */
function markColor(person: Person): ChartColor {
  switch (person) {
    case 'a':
      return 'person-a'
    case 'b':
      return 'person-b'
    default:
      return 'muted'
  }
}

/**
 * The Month view `/month/:ym?` (DESIGN.md, screen skeleton "Month"): month
 * strip, money spent as the hero with the change against the previous
 * month (up to the same day while the month runs), three stat tiles with
 * sparklines, spending by category group,
 * the 6-month trend, who paid, the top five expenses, the AI-written
 * summary (InsightSummaryCardComponent) and two deterministic insights.
 * The current month also shows what the recurring payments commit
 * (CommittedCardComponent, under the stat tiles or the empty state), or
 * the hint to detect them.
 * Data comes from the MonthStore: switching months keeps the previous
 * frame at 60% opacity until the new one arrives; skeletons only on the
 * first load. A month without transactions shows an honest empty state.
 */
@Component({
  selector: 'app-month-page',
  imports: [
    BannerComponent,
    BarListComponent,
    ButtonComponent,
    CardComponent,
    ChartFrameComponent,
    CommittedCardComponent,
    EmptyStateComponent,
    InsightSummaryCardComponent,
    ListRowComponent,
    MonthHeroComponent,
    MonthPickerComponent,
    RouterLink,
    SkeletonComponent,
    StackedBar100Component,
    StatTileComponent,
    StatTileSparklineComponent,
    TranslocoPipe,
    TrendLineComponent,
  ],
  providers: [provideMonthScope()],
  template: `
    <h1 class="sr-only">{{ 'month.title' | transloco }}</h1>
    <header class="sticky top-0 z-10 border-b border-line bg-surface-0 px-3 py-1.5">
      <app-month-picker
        data-testid="month.picker"
        [label]="'month.picker.label' | transloco"
        [current]="current()"
        [selected]="store.selectedMonth()"
        (selectedChange)="go($event)"
      />
    </header>

    <div class="flex flex-col gap-8 px-4 pt-6 pb-8">
      @if (store.status() === 'error') {
        <app-banner
          data-testid="month.error"
          status="critical"
          [message]="'month.error' | transloco"
          [actionLabel]="'errors.retry' | transloco"
          (action)="store.retry()"
        />
      }

      @if (store.status() === 'loading') {
        <div data-testid="month.loading" role="status" class="flex flex-col gap-8">
          <span class="sr-only">{{ 'month.loading' | transloco }}</span>
          <div class="flex flex-col gap-2">
            <app-skeleton width="40%" height="16px" />
            <app-skeleton width="70%" height="48px" />
            <app-skeleton width="60%" height="24px" />
          </div>
          <app-skeleton height="72px" />
          <app-skeleton height="240px" />
          <app-skeleton height="180px" />
        </div>
      } @else if (report(); as report) {
        <div
          data-testid="month.content"
          class="flex flex-col gap-8 transition-opacity"
          [class.opacity-60]="dimmed()"
          [attr.aria-busy]="dimmed()"
        >
          <app-month-hero
            class="border-b border-line pb-6"
            [eyebrow]="'month.hero.eyebrow' | transloco: { month: monthName() }"
            [cents]="report.expenseCents"
            [direction]="delta()?.direction ?? 'flat'"
            [deltaText]="deltaKey() ? (deltaKey() | transloco: deltaParams()) : ''"
          />

          @if (isEmpty()) {
            <app-empty-state
              data-testid="month.empty"
              icon="calendar"
              [title]="'month.empty.title' | transloco: { month: monthName() }"
              [body]="'month.empty.body' | transloco"
            >
              <div class="flex flex-wrap justify-center gap-2">
                <a appButton variant="secondary" icon="plus" routerLink="/add">{{
                  'month.empty.add' | transloco
                }}</a>
                <a
                  appButton
                  variant="ghost"
                  icon="file-up"
                  routerLink="/import"
                  data-testid="month.empty.import"
                  >{{ 'month.empty.import' | transloco }}</a
                >
              </div>
            </app-empty-state>
            @if (isCurrent()) {
              <app-committed-card
                [committed]="report.committed"
                [incomeCents]="report.incomeCents"
                [expenseCents]="report.expenseCents"
                [detecting]="detecting()"
                (detect)="detectRecurring()"
              />
            }
          } @else {
            <section
              data-testid="month.stats"
              class="grid grid-cols-3 border-b border-line pb-6"
              [attr.aria-label]="'month.stats.label' | transloco"
            >
              <app-stat-tile
                data-testid="month.stats.income"
                [label]="'month.stats.income' | transloco"
                [valueCents]="report.incomeCents"
              >
                <app-stat-tile-sparkline [values]="sparklines().income" />
              </app-stat-tile>
              <app-stat-tile
                data-testid="month.stats.spent"
                [label]="'month.stats.spent' | transloco"
                [valueCents]="report.expenseCents"
              >
                <app-stat-tile-sparkline [values]="sparklines().spent" />
              </app-stat-tile>
              <app-stat-tile
                data-testid="month.stats.saved"
                [label]="'month.stats.saved' | transloco"
                [valueCents]="report.netCents"
              >
                <app-stat-tile-sparkline [values]="sparklines().saved" />
              </app-stat-tile>
            </section>

            @if (isCurrent()) {
              <app-committed-card
                [committed]="report.committed"
                [incomeCents]="report.incomeCents"
                [expenseCents]="report.expenseCents"
                [detecting]="detecting()"
                (detect)="detectRecurring()"
              />
            }

            <app-chart-frame
              data-testid="month.spend"
              skeletonHeight="240px"
              [title]="'month.spend.title' | transloco"
              [subtitle]="'month.spend.subtitle' | transloco: { count: spending().length }"
              [emptyText]="'month.spend.empty' | transloco: { month: monthName() }"
              [state]="spending().length > 0 ? chartState() : 'empty'"
            >
              <app-bar-list
                [data]="spending()"
                [(expanded)]="expanded"
                [nameHeader]="'month.spend.header' | transloco"
              />
            </app-chart-frame>

            <app-chart-frame
              data-testid="month.trend"
              skeletonHeight="180px"
              [title]="'month.trend.title' | transloco"
              [subtitle]="trendRange()"
              [state]="chartState()"
            >
              <app-trend-line [series]="trendSeries()" [data]="trendData()" />
            </app-chart-frame>

            <app-chart-frame
              data-testid="month.whoPaid"
              skeletonHeight="140px"
              [title]="'month.whoPaid.title' | transloco"
              [subtitle]="monthName()"
              [emptyText]="'month.whoPaid.empty' | transloco: { month: monthName() }"
              [state]="whoPaid().length > 0 ? chartState() : 'empty'"
            >
              <app-stacked-bar-100 [data]="whoPaid()" />
            </app-chart-frame>

            @if (topRows().length > 0) {
              <section data-testid="month.top" class="flex flex-col">
                <header class="flex items-center justify-between gap-2">
                  <h2 class="text-heading text-ink-1">{{ 'month.top.title' | transloco }}</h2>
                  <a
                    appButton
                    variant="link"
                    class="-mr-3"
                    routerLink="/transactions"
                    [queryParams]="{ month: shownMonth() }"
                    >{{ 'month.top.viewAll' | transloco }}</a
                  >
                </header>
                <div role="list" class="-mx-4 mt-2">
                  @for (row of topRows(); track row.id) {
                    <app-list-row
                      interactive
                      [attr.data-transaction]="row.id"
                      [icon]="row.icon"
                      [title]="row.title"
                      [meta]="row.meta"
                      [person]="row.person"
                      [amountCents]="row.amountCents"
                      kind="expense"
                      (pressed)="openTransaction(row.id)"
                    />
                  }
                </div>
              </section>
            }

            <section data-testid="month.insights" class="flex flex-col gap-4">
              <h2 class="text-heading text-ink-1">{{ 'month.insights.title' | transloco }}</h2>
              <app-insight-summary-card [month]="shownMonth()" />
              @for (insight of insights(); track insight.key) {
                <app-card
                  data-testid="month.insight"
                  [eyebrow]="'month.insights.eyebrow' | transloco"
                >
                  <p class="text-body text-ink-1">
                    {{ insight.key | transloco: insight.params }}
                  </p>
                </app-card>
              }
            </section>
          }
        </div>
      }
    </div>
  `,
})
export default class MonthPage {
  protected readonly store = inject(MonthStore)
  private readonly directory = inject(HouseholdDirectory)
  private readonly router = inject(Router)
  private readonly locale = inject(APP_LOCALE)
  private readonly recurring = inject(RecurringApi)
  private readonly toasts = inject(ToastStore)

  /** `/month/:ym`, bound by the router; missing or invalid means the current month. */
  readonly ym = input<string | undefined>(undefined)

  protected readonly current = this.store.current
  protected readonly expanded = signal<string[]>([])
  /** "Detect recurring payments" is on its way. */
  protected readonly detecting = signal(false)

  private readonly labels = translateSignal(LABEL_KEYS)
  /** Words the charts and rows need, in the reader's language. */
  private readonly text = computed(() => {
    const [
      uncategorized = '',
      privateBucket = '',
      unknown = '',
      you = '',
      joint = '',
      series = '',
      privateRow = '',
      noPayee = '',
      uncategorizedRow = '',
      splitRow = '',
    ] = this.labels()
    return {
      uncategorized,
      privateBucket,
      unknown,
      you,
      joint,
      series,
      privateRow,
      noPayee,
      uncategorizedRow,
      splitRow,
    }
  })

  protected readonly frame = this.store.frame
  protected readonly report = computed(() => this.frame()?.report)
  protected readonly shownMonth = computed(() => this.frame()?.month ?? this.store.selectedMonth())
  protected readonly dimmed = computed(
    () => this.store.status() === 'reloading' || this.store.status() === 'error'
  )
  protected readonly chartState = computed<ChartState>(() =>
    this.dimmed() ? 'reloading' : 'ready'
  )
  protected readonly isEmpty = computed(() => (this.report()?.transactionCount ?? 0) === 0)
  /** "Committed this month" is about the month being lived, not past ones. */
  protected readonly isCurrent = computed(() => this.shownMonth() === this.current())

  protected readonly monthName = computed(() => this.longName(this.shownMonth()))

  private readonly totals = computed(() => this.frame()?.trend.totals ?? [])
  /**
   * What the hero compares with, from the month report: the previous month
   * up to the same day while this one is still running (`previousToDate`),
   * else the whole previous month.
   */
  private readonly baseline = computed(() => {
    const report = this.report()
    if (!report) {
      return null
    }
    return report.previousToDate
      ? { toDate: true, expenseCents: report.previousToDate.expenseCents }
      : { toDate: false, expenseCents: report.previous.expenseCents }
  })
  protected readonly delta = computed(() => {
    const report = this.report()
    const baseline = this.baseline()
    return report && baseline ? spendDelta(report.expenseCents, baseline.expenseCents) : null
  })
  protected readonly deltaKey = computed(() => {
    const delta = this.delta()
    if (!delta || delta.percent === null) {
      return ''
    }
    const keys = this.baseline()?.toDate
      ? {
          down: 'month.hero.lessToDate',
          up: 'month.hero.moreToDate',
          flat: 'month.hero.sameToDate',
        }
      : { down: 'month.hero.less', up: 'month.hero.more', flat: 'month.hero.same' }
    return keys[delta.direction]
  })
  protected readonly deltaParams = computed(() => ({
    percent: this.delta()?.percent ?? 0,
    month: this.longName(addMonths(this.shownMonth(), -1)),
    amount: formatMoney(this.baseline()?.expenseCents ?? 0, this.locale()),
  }))

  protected readonly sparklines = computed(() => ({
    income: totalsSeries(this.totals(), 'incomeCents'),
    spent: totalsSeries(this.totals(), 'expenseCents'),
    saved: totalsSeries(this.totals(), 'netCents'),
  }))

  protected readonly spending = computed(() => {
    const report = this.report()
    if (!report) {
      return []
    }
    return spendByGroup(report.byGroup, report.byCategory, {
      group: (id) => this.directory.group(id)?.name ?? this.text().unknown,
      category: (id) => this.directory.category(id)?.category.name ?? this.text().unknown,
      uncategorized: this.text().uncategorized,
      private: this.text().privateBucket,
    })
  })

  protected readonly trendSeries = computed(() => [{ id: 'spent', label: this.text().series }])
  protected readonly trendData = computed(() => spendTrend(this.totals(), 'spent'))
  protected readonly trendRange = computed(() => {
    const totals = this.totals()
    const first = totals[0]
    const last = totals.at(-1)
    if (!first || !last) {
      return ''
    }
    const short = (ym: string) => monthLabel(ym as YearMonth, this.locale())
    return `${short(first.month)} – ${short(last.month)}`
  })

  protected readonly whoPaid = computed(() => {
    const report = this.report()
    const youId = this.directory.youId()
    if (!report || youId === null) {
      return []
    }
    const partnerId = this.directory.partner()?.userId ?? null
    return spendByPerson(
      report.byPerson,
      {
        youId,
        partnerId,
        youColor: markColor(this.directory.personOf(youId)),
        partnerColor: markColor(this.directory.personOf(partnerId)),
      },
      { you: this.text().you, partner: this.directory.partnerName(), joint: this.text().joint }
    )
  })

  protected readonly topRows = computed<TopRow[]>(() =>
    (this.report()?.topExpenses ?? []).map((row) => {
      const text = this.text()
      const entry = this.directory.category(row.categoryId)
      const category = row.isMasked
        ? text.privateRow
        : row.isSplit
          ? text.splitRow
          : (entry?.category.name ?? text.uncategorizedRow)
      return {
        id: row.id,
        icon: row.isMasked ? 'lock' : categoryIcon(entry?.category ?? null),
        title: row.isMasked ? text.privateRow : row.payee || row.description || text.noPayee,
        meta: [category, formatDayMonth(row.date, this.locale())],
        person: this.directory.personOf(row.paidByUserId),
        amountCents: row.amountCents,
      }
    })
  )

  protected readonly insights = computed<InsightText[]>(() => {
    const frame = this.frame()
    if (!frame) {
      return []
    }
    const { report, trend } = frame
    const { previousToDate, previousMonthsToDate } = report
    // A running month compares with the same days of the months before; a closed one with whole months.
    const histories =
      previousToDate && previousMonthsToDate
        ? sameDayHistories(previousMonthsToDate, report)
        : {
            groups: groupHistories(trend.series),
            spendHistory: trend.totals.map((month) => month.expenseCents),
          }
    return monthInsights({
      incomeCents: report.incomeCents,
      expenseCents: report.expenseCents,
      netCents: report.netCents,
      ...histories,
      ...(previousToDate ? { toDate: { throughDay: previousToDate.throughDay } } : {}),
    }).map((insight) => this.insightText(insight))
  })

  constructor() {
    void this.directory.load().catch(() => undefined)
    // The URL decides the month: a missing, invalid or future one shows the current month.
    effect(() => {
      const ym = this.ym()
      const current = this.current()
      const month =
        ym !== undefined && isYearMonth(ym) && compareYearMonth(ym, current) <= 0 ? ym : current
      untracked(() => this.store.select(month))
    })
  }

  protected go(month: YearMonth): void {
    this.store.select(month)
    void this.router.navigate(['/month', month], { replaceUrl: true })
  }

  protected openTransaction(id: number): void {
    void this.router.navigate(['/transactions', id])
  }

  /** Looks for recurring payments in the ledger, says what it found and reloads the month. */
  protected async detectRecurring(): Promise<void> {
    if (this.detecting()) {
      return
    }
    this.detecting.set(true)
    try {
      const { created } = await this.recurring.detect()
      this.toasts.show(
        created > 0
          ? { messageKey: 'month.committed.found', params: { count: created }, status: 'good' }
          : { messageKey: 'month.committed.noneFound' }
      )
      this.store.invalidate(this.current())
    } catch (error) {
      const apiError = toApiError(error)
      if (apiError.kind !== 'unauthorized') {
        const message = failureMessage(apiError)
        this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
      }
    } finally {
      this.detecting.set(false)
    }
  }

  private longName(month: YearMonth): string {
    return monthLabel(month, this.locale(), {
      long: true,
      withYear: yearOf(month) !== yearOf(this.current()),
    })
  }

  private insightText(insight: Insight): InsightText {
    const key = `month.insights.${insight.kind}`
    if ('groupId' in insight) {
      const group = this.directory.group(insight.groupId)?.name ?? this.text().unknown
      return { key, params: { group, percent: insight.percent } }
    }
    return { key, params: { percent: insight.percent } }
  }
}
