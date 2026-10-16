import { Component, computed, effect, inject, input, untracked } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { HouseholdDirectory } from '../../../core/household/household-directory.store'
import type { ChartColor } from '../../../domain/charts/colors'
import { label as monthLabel } from '../../../domain/month'
import { spendByPerson } from '../../../domain/month-view'
import { tagPeriod, tagSpending, tagTrend } from '../../../domain/tags'
import { BarListComponent } from '../../../shared/charts/bar-list/bar-list.component'
import {
  ChartFrameComponent,
  type ChartState,
} from '../../../shared/charts/chart-frame/chart-frame.component'
import { StackedBar100Component } from '../../../shared/charts/stacked-bar-100/stacked-bar-100.component'
import { TrendLineComponent } from '../../../shared/charts/trend-line/trend-line.component'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import type { Person } from '../../../shared/ui/person-dot/person-dot.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { StatTileComponent } from '../../../shared/ui/stat-tile/stat-tile.component'
import { TagDetailStore } from '../tag-detail.store'
import { provideTagsScope } from '../tags.scope'

/**
 * Keys read from TypeScript, relative to the `tags` scope:
 * t(tags.detail.spend.uncategorized, tags.detail.spend.unknown)
 * t(tags.detail.trend.spent, tags.detail.trend.setAside)
 * t(tags.detail.whoPaid.you, tags.detail.whoPaid.joint)
 */
const LABEL_KEYS = [
  'detail.spend.uncategorized',
  'detail.spend.unknown',
  'detail.trend.spent',
  'detail.trend.setAside',
  'detail.whoPaid.you',
  'detail.whoPaid.joint',
]

/** The chart colour of a person mark (the shared ring is muted), as on the Month view. */
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
 * One tag `/tags/:tag` (the URL-encoded tag): money spent with it as the
 * hero, how many transactions and which months, income, money set aside
 * (tagged transfers into savings) and the net as stat tiles; spending by
 * category, the month-by-month trend and who paid, each chart with its
 * table view; and a link to the transactions list filtered by the tag.
 */
@Component({
  selector: 'app-tag-detail-page',
  imports: [
    AmountDisplayComponent,
    BannerComponent,
    BarListComponent,
    ButtonComponent,
    ChartFrameComponent,
    EmptyStateComponent,
    IconButtonComponent,
    RouterLink,
    SkeletonComponent,
    StackedBar100Component,
    StatTileComponent,
    TranslocoPipe,
    TrendLineComponent,
  ],
  providers: [TagDetailStore, provideTagsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-1 pl-1">
      <a appIconButton icon="arrow-left" routerLink="/tags" [label]="'tags.back' | transloco"></a>
      <h1 class="min-w-0 flex-1 truncate text-heading text-ink-1" data-testid="tag.name">
        {{ tag() }}
      </h1>
    </header>

    @switch (store.status()) {
      @case ('loading') {
        <div class="flex flex-col gap-6 px-4 pt-2" data-testid="tag.loading" role="status">
          <span class="sr-only">{{ 'tags.detail.loading' | transloco }}</span>
          <div class="flex flex-col gap-2">
            <app-skeleton width="40%" height="16px" />
            <app-skeleton width="60%" height="48px" />
            <app-skeleton width="50%" height="20px" />
          </div>
          <app-skeleton height="72px" />
          <app-skeleton height="200px" />
        </div>
      }
      @case ('notFound') {
        <app-empty-state
          data-testid="tag.notFound"
          icon="tag"
          [title]="'tags.detail.notFound.title' | transloco"
          [body]="'tags.detail.notFound.body' | transloco"
        >
          <a appButton variant="secondary" routerLink="/tags">{{
            'tags.detail.notFound.back' | transloco
          }}</a>
        </app-empty-state>
      }
      @case ('error') {
        <app-banner
          class="mx-4 mt-2"
          data-testid="tag.error"
          status="critical"
          [message]="'tags.detail.error' | transloco"
          [actionLabel]="'tags.detail.retry' | transloco"
          (action)="store.retry()"
        />
      }
      @default {
        @if (store.detail(); as detail) {
          <div class="flex flex-col gap-8 px-4 pt-2 pb-8">
            <section data-testid="tag.hero" class="flex flex-col gap-1 border-b border-line pb-6">
              <p class="text-eyebrow text-ink-2 uppercase">
                {{ 'tags.detail.eyebrow' | transloco }}
              </p>
              <app-amount-display
                data-testid="tag.spent"
                variant="hero"
                [cents]="detail.expenseCents"
              />
              <p class="text-body text-ink-2" data-testid="tag.meta">
                {{ 'tags.count' | transloco: { count: detail.count } }}
                @if (period()) {
                  · {{ period() }}
                }
              </p>
            </section>

            <section
              data-testid="tag.stats"
              class="grid grid-cols-3 border-b border-line pb-6"
              [attr.aria-label]="'tags.title' | transloco"
            >
              <app-stat-tile
                data-testid="tag.stats.income"
                [label]="'tags.totals.income' | transloco"
                [valueCents]="detail.incomeCents"
              />
              <app-stat-tile
                data-testid="tag.stats.setAside"
                [label]="'tags.totals.setAside' | transloco"
                [valueCents]="detail.setAsideCents"
              />
              <app-stat-tile
                data-testid="tag.stats.net"
                [label]="'tags.totals.net' | transloco"
                [valueCents]="detail.netCents"
              />
            </section>

            <app-chart-frame
              data-testid="tag.spend"
              skeletonHeight="200px"
              [title]="'tags.detail.spend.title' | transloco"
              [emptyText]="'tags.detail.spend.empty' | transloco"
              [state]="spending().length > 0 ? 'ready' : 'empty'"
            >
              <app-bar-list
                [data]="spending()"
                [nameHeader]="'tags.detail.spend.header' | transloco"
              />
            </app-chart-frame>

            <app-chart-frame
              data-testid="tag.trend"
              skeletonHeight="180px"
              [title]="'tags.detail.trend.title' | transloco"
              [subtitle]="period()"
              [state]="trendState()"
            >
              <app-trend-line [series]="trendSeries()" [data]="trend().data" />
            </app-chart-frame>

            <app-chart-frame
              data-testid="tag.whoPaid"
              skeletonHeight="140px"
              [title]="'tags.detail.whoPaid.title' | transloco"
              [emptyText]="'tags.detail.whoPaid.empty' | transloco"
              [state]="whoPaid().length > 0 ? 'ready' : 'empty'"
            >
              <app-stacked-bar-100 [data]="whoPaid()" />
            </app-chart-frame>

            <a
              appButton
              variant="secondary"
              icon="list"
              data-testid="tag.movements"
              routerLink="/transactions"
              [queryParams]="{ tag: detail.tag }"
              >{{ 'tags.detail.movements' | transloco }}</a
            >
          </div>
        }
      }
    }
  `,
})
export default class TagDetailPage {
  protected readonly store = inject(TagDetailStore)
  private readonly directory = inject(HouseholdDirectory)
  private readonly locale = inject(APP_LOCALE)

  /** `/tags/:tag`, bound (already decoded) by the router. */
  readonly tag = input.required<string>()

  private readonly labels = translateSignal(LABEL_KEYS)
  private readonly text = computed(() => {
    const [uncategorized = '', unknown = '', spent = '', setAside = '', you = '', joint = ''] =
      this.labels()
    return { uncategorized, unknown, spent, setAside, you, joint }
  })

  private readonly detail = this.store.detail

  /** The months the tag spans: "Jul 2026 – Jan 2027". */
  protected readonly period = computed(() => {
    const detail = this.detail()
    const locale = this.locale()
    return detail
      ? tagPeriod(detail.firstDate, detail.lastDate)
          .map((month) => monthLabel(month, locale, { withYear: true }))
          .join(' – ')
      : ''
  })

  protected readonly spending = computed(() =>
    tagSpending(this.detail()?.byCategory ?? [], {
      category: (id) => this.directory.category(id)?.category.name ?? this.text().unknown,
      uncategorized: this.text().uncategorized,
    })
  )

  protected readonly trend = computed(() => tagTrend(this.detail()?.byMonth ?? []))
  protected readonly trendSeries = computed(() =>
    this.trend().series.map((id) => ({
      id,
      label: id === 'spent' ? this.text().spent : this.text().setAside,
    }))
  )
  protected readonly trendState = computed<ChartState>(() =>
    this.trend().data.length > 0 ? 'ready' : 'empty'
  )

  protected readonly whoPaid = computed(() => {
    const detail = this.detail()
    const youId = this.directory.youId()
    if (!detail || youId === null) {
      return []
    }
    const partnerId = this.directory.partner()?.userId ?? null
    return spendByPerson(
      detail.byPerson,
      {
        youId,
        partnerId,
        youColor: markColor(this.directory.personOf(youId)),
        partnerColor: markColor(this.directory.personOf(partnerId)),
      },
      { you: this.text().you, partner: this.directory.partnerName(), joint: this.text().joint }
    )
  })

  constructor() {
    void this.directory.load().catch(() => undefined)
    effect(() => {
      const tag = this.tag()
      untracked(() => this.store.open(tag))
    })
  }
}
