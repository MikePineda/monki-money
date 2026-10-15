import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core'
import { Router, RouterLink, type Route } from '@angular/router'
import { TranslocoPipe, provideTranslocoScope, translateSignal } from '@jsverse/transloco'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { MonthStore } from '../../core/month/month.store'
import { formatDayMonth } from '../../domain/dates'
import { groupHistories, monthInsights, type Insight } from '../../domain/insights'
import { formatMoney } from '../../domain/money'
import {
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
import { categoryIcon } from '../../shared/icons/category-icon'
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
import { MonthHeroComponent } from './ui/month-hero.component'

/**
 * Scoped keys used from TypeScript. translateSignal() adds the "month."
 * prefix itself (relative keys); keys picked at runtime are listed in full.
 * Declared for transloco-keys-manager:
 * t(month.hero.less, month.hero.more, month.hero.same)
 * t(month.insights.groupAboveAverage, month.insights.groupBelowAverage, month.insights.groupShare)
 * t(month.insights.savedShare, month.insights.overspent)
 * t(month.insights.spendAboveAverage, month.insights.spendBelowAverage)
 * t(month.spend.uncategorized, month.spend.private, month.spend.unknown, month.trend.series)
 * t(month.whoPaid.you, month.whoPaid.joint)
 * t(month.top.private, month.top.noPayee, month.top.uncategorized)
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
]

interface TopRow {
  id: number
  icon: IconName
  title: string
  meta: string[]
  person: Person
  amountCents: number
  kind: 'expense' | 'income' | 'transfer'
}

interface InsightText {
  key: string
  params: Record<string, string | number>
}

/** True when the router knows a top-level or shell route with this path (import lands later). */
function hasRoute(routes: readonly Route[], path: string): boolean {
  return routes.some((route) => route.path === path || hasRoute(route.children ?? [], path))
}

/**
 * The Month view `/month/:ym?` (DESIGN.md, screen skeleton "Month"): month
 * strip, money spent as the hero with the change against the previous
 * month, three stat tiles with sparklines, spending by category group,
 * the 6-month trend, who paid, the top five expenses and two insights.
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
    EmptyStateComponent,
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
  providers: [
    provideTranslocoScope({
      scope: 'month',
      loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
    }),
  ],
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
                @if (canImport) {
                  <a appButton variant="ghost" icon="file-up" routerLink="/import">{{
                    'month.empty.import' | transloco
                  }}</a>
                }
              </div>
            </app-empty-state>
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
                      [kind]="row.kind"
                      (pressed)="openTransaction(row.id)"
                    />
                  }
                </div>
              </section>
            }

            @if (insights().length > 0) {
              <section data-testid="month.insights" class="flex flex-col gap-4">
                <h2 class="text-heading text-ink-1">{{ 'month.insights.title' | transloco }}</h2>
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

  /** `/month/:ym`, bound by the router; missing or invalid means the current month. */
  readonly ym = input<string | undefined>(undefined)

  protected readonly canImport = hasRoute(this.router.config, 'import')
  protected readonly current = signal(this.store.currentMonth())
  protected readonly expanded = signal<string[]>([])

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

  protected readonly monthName = computed(() => this.longName(this.shownMonth()))

  private readonly totals = computed(() => this.frame()?.trend.totals ?? [])
  protected readonly delta = computed(() => {
    const previous = this.totals().at(-2)
    const report = this.report()
    return report && previous ? spendDelta(report.expenseCents, previous.expenseCents) : null
  })
  protected readonly deltaKey = computed(() => {
    const delta = this.delta()
    if (!delta || delta.percent === null) {
      return ''
    }
    return { down: 'month.hero.less', up: 'month.hero.more', flat: 'month.hero.same' }[
      delta.direction
    ]
  })
  protected readonly deltaParams = computed(() => {
    const previous = this.totals().at(-2)
    return {
      percent: this.delta()?.percent ?? 0,
      month: previous ? this.longName(previous.month as YearMonth) : '',
      amount: formatMoney(previous?.expenseCents ?? 0, this.locale()),
    }
  })

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
    return spendByPerson(
      report.byPerson,
      { youId, partnerId: this.directory.partner()?.userId ?? null },
      { you: this.text().you, partner: this.directory.partnerName(), joint: this.text().joint }
    )
  })

  protected readonly topRows = computed<TopRow[]>(() =>
    (this.frame()?.top ?? []).map((row) => {
      const text = this.text()
      const entry = this.directory.category(row.categoryId)
      const category = row.isMasked
        ? text.privateRow
        : (entry?.category.name ?? text.uncategorizedRow)
      return {
        id: row.id,
        icon: row.isMasked ? 'lock' : categoryIcon(entry?.category ?? null),
        title: row.isMasked ? text.privateRow : row.payee || row.description || text.noPayee,
        meta: [category, formatDayMonth(row.date, this.locale())],
        person: this.directory.personOf(row.paidByUserId),
        amountCents: row.amountCents,
        kind: row.kind,
      }
    })
  )

  protected readonly insights = computed<InsightText[]>(() => {
    const frame = this.frame()
    if (!frame) {
      return []
    }
    const { report, trend } = frame
    return monthInsights({
      incomeCents: report.incomeCents,
      expenseCents: report.expenseCents,
      netCents: report.netCents,
      groups: groupHistories(trend.series),
      spendHistory: trend.totals.map((month) => month.expenseCents),
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
