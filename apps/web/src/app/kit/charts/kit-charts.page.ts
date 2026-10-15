import { Component, computed, inject, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, provideTranslocoScope, translateSignal } from '@jsverse/transloco'
import type { BarListDatum } from '../../domain/charts/bar-list'
import { monthText } from '../../domain/charts/format'
import { BarListComponent } from '../../shared/charts/bar-list/bar-list.component'
import {
  ChartFrameComponent,
  type ChartState,
} from '../../shared/charts/chart-frame/chart-frame.component'
import { ProjectionChartComponent } from '../../shared/charts/projection-chart/projection-chart.component'
import {
  StackedBar100Component,
  type StackedBarDatum,
} from '../../shared/charts/stacked-bar-100/stacked-bar-100.component'
import { StatTileSparklineComponent } from '../../shared/charts/stat-tile-sparkline/stat-tile-sparkline.component'
import {
  TrendLineComponent,
  type TrendDatum,
  type TrendSeries,
} from '../../shared/charts/trend-line/trend-line.component'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { ButtonComponent } from '../../shared/ui/button/button.component'
import { ChipComponent } from '../../shared/ui/chip/chip.component'
import { SectionHeaderComponent } from '../../shared/ui/section-header/section-header.component'
import { StatTileComponent } from '../../shared/ui/stat-tile/stat-tile.component'
import { KitPreferencesComponent } from '../kit-preferences.component'
import {
  EMERGENCY_FUND,
  MONTHLY_INCOME,
  MONTHLY_SPENDING,
  MONTHS,
  SPENDING_BY_CATEGORY,
  SPENDING_BY_PERSON,
  TOP_MERCHANTS,
  WHO_PAID,
} from './kit-charts.data'

/**
 * t(kit.charts.cat.housing, kit.charts.cat.food, kit.charts.cat.leisure)
 * t(kit.charts.cat.publicTransport, kit.charts.cat.fuel, kit.charts.trend.series)
 * t(kit.data.groceries, kit.data.eatingOut, kit.data.coffee, kit.data.transport)
 * t(kit.data.health, kit.data.other, kit.data.you, kit.data.partner, kit.data.shared)
 * t(kit.charts.state.ready, kit.charts.state.loading, kit.charts.state.reloading)
 * t(kit.charts.state.empty, kit.charts.state.error)
 */
// Relative to the kit scope; translateSignal() adds the "kit." prefix.
const PEOPLE_KEYS = ['data.you', 'data.partner', 'data.shared', 'charts.trend.series']
const CATEGORY_KEYS = SPENDING_BY_CATEGORY.flatMap((group) => [
  group.key,
  ...(group.children ?? []).map((child) => child.key),
])

const STATES: readonly ChartState[] = ['ready', 'loading', 'reloading', 'empty', 'error']

/**
 * The charts gallery (`/__kit/charts`, development builds only): every chart
 * in every state with realistic AUD data, the same live theme and language
 * switches as the ui-kit, and a state switch that drives every frame. Used
 * for visual QA against DESIGN.md and the dataviz rules in both themes.
 */
@Component({
  selector: 'app-kit-charts-page',
  imports: [
    BarListComponent,
    ButtonComponent,
    ChartFrameComponent,
    ChipComponent,
    KitPreferencesComponent,
    ProjectionChartComponent,
    RouterLink,
    SectionHeaderComponent,
    StackedBar100Component,
    StatTileComponent,
    StatTileSparklineComponent,
    TranslocoPipe,
    TrendLineComponent,
  ],
  providers: [
    provideTranslocoScope({
      scope: 'kit',
      loader: { en: () => import('../i18n/en.json'), es: () => import('../i18n/es.json') },
    }),
  ],
  templateUrl: './kit-charts.page.html',
})
export default class KitChartsPage {
  private readonly locale = inject(APP_LOCALE)

  protected readonly states = STATES
  protected readonly state = signal<ChartState>('ready')
  protected readonly expanded = signal<readonly string[]>(['food'])

  protected readonly emergencyFund = EMERGENCY_FUND
  protected readonly incomeTrend = MONTHLY_INCOME
  protected readonly spendingTrend = MONTHLY_SPENDING
  protected readonly savedTrend = MONTHLY_INCOME.map((income, index) => {
    return income - (MONTHLY_SPENDING[index] ?? 0)
  })
  protected readonly latest = {
    income: MONTHLY_INCOME.at(-1) ?? 0,
    spent: MONTHLY_SPENDING.at(-1) ?? 0,
    saved: (MONTHLY_INCOME.at(-1) ?? 0) - (MONTHLY_SPENDING.at(-1) ?? 0),
  }

  private readonly categoryLabels = translateSignal(CATEGORY_KEYS)
  private readonly peopleLabels = translateSignal(PEOPLE_KEYS)

  private readonly label = computed(() => {
    const labels = this.categoryLabels()
    return new Map(CATEGORY_KEYS.map((key, index) => [key, labels[index] ?? '']))
  })

  protected readonly monthName = computed(() =>
    monthText(MONTHS.at(-1) ?? '', this.locale(), { long: true })
  )
  protected readonly range = computed(
    () =>
      `${monthText(MONTHS[0], this.locale())} – ${monthText(MONTHS.at(-1) ?? '', this.locale())}`
  )

  protected readonly spending = computed<BarListDatum[]>(() =>
    SPENDING_BY_CATEGORY.map((group) => ({
      id: group.id,
      label: this.label().get(group.key) ?? '',
      valueCents: group.valueCents,
      other: group.other,
      children: group.children?.map((child) => ({
        id: child.id,
        label: this.label().get(child.key) ?? '',
        valueCents: child.valueCents,
      })),
    }))
  )

  protected readonly merchants: BarListDatum[] = TOP_MERCHANTS.map((merchant) => ({
    ...merchant,
  }))

  protected readonly trendSeries = computed<TrendSeries[]>(() => [
    { id: 'spending', label: this.peopleLabels()[3] ?? '' },
  ])
  protected readonly trendData: TrendDatum[] = MONTHS.map((x, index) => ({
    x,
    series: [{ id: 'spending', valueCents: MONTHLY_SPENDING[index] ?? null }],
  }))

  protected readonly peopleSeries = computed<TrendSeries[]>(() => {
    const [you = '', partner = ''] = this.peopleLabels()
    return [
      { id: 'you', label: you, color: 'person-a' },
      { id: 'partner', label: partner, color: 'person-b' },
    ]
  })
  protected readonly peopleData: TrendDatum[] = MONTHS.map((x, index) => ({
    x,
    series: [
      { id: 'you', valueCents: SPENDING_BY_PERSON.you[index] ?? null },
      { id: 'partner', valueCents: SPENDING_BY_PERSON.partner[index] ?? null },
    ],
  }))

  protected readonly whoPaid = computed<StackedBarDatum[]>(() => {
    const [you = '', partner = '', shared = ''] = this.peopleLabels()
    return [
      { id: 'you', label: you, valueCents: WHO_PAID.you, color: 'person-a' },
      { id: 'partner', label: partner, valueCents: WHO_PAID.partner, color: 'person-b' },
      { id: 'shared', label: shared, valueCents: WHO_PAID.shared, color: 'muted' },
    ]
  })
}
