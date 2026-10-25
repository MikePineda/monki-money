import { Component, Injector, computed, effect, inject, input, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { map } from 'rxjs'
import { HouseholdDirectory } from '../../../core/household/household-directory.store'
import { TagsStore } from '../../../core/ledger/tags.store'
import { MonthStore } from '../../../core/month/month.store'
import { ToastStore } from '../../../core/ui/toast.store'
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
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import type { Person } from '../../../shared/ui/person-dot/person-dot.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { StatTileComponent } from '../../../shared/ui/stat-tile/stat-tile.component'
import { TagDetailStore } from '../tag-detail.store'
import { tagPeriodOf, tagRangeOf, type TagPeriod } from '../tag-period'
import { provideTagsScope } from '../tags.scope'
import { TagPeriodComponent } from '../ui/tag-period.component'
import { RenameTagSheetComponent, type RenameTagData, type RenamedTag } from './rename-tag.sheet'

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
 * The period chip narrows every number to a date range (`?period=`, kept
 * from the list), and the pencil renames the tag everywhere (typing the
 * name of another tag merges the two).
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
    TagPeriodComponent,
    TranslocoPipe,
    TrendLineComponent,
  ],
  providers: [TagDetailStore, provideTagsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-1 pl-1">
      <a
        appIconButton
        icon="arrow-left"
        routerLink="/tags"
        queryParamsHandling="preserve"
        [label]="'tags.back' | transloco"
      ></a>
      <h1 class="min-w-0 flex-1 truncate text-heading text-ink-1" data-testid="tag.name">
        {{ tag() }}
      </h1>
      @if (store.status() === 'ready') {
        <button
          appIconButton
          type="button"
          icon="pencil"
          data-testid="tag.rename"
          [label]="'tags.detail.rename.action' | transloco"
          (click)="rename()"
        ></button>
      }
    </header>
    @if (store.status() !== 'notFound') {
      <app-tag-period class="px-4 pb-2" [period]="datePeriod()" (changed)="choosePeriod($event)" />
    }

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
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly months = inject(MonthStore)
  private readonly tags = inject(TagsStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly toasts = inject(ToastStore)
  private readonly injector = inject(Injector)

  /** `/tags/:tag`, bound (already decoded) by the router. */
  readonly tag = input.required<string>()

  /** `?period=` (every date when absent), shared with the list. */
  protected readonly datePeriod = toSignal(
    this.route.queryParamMap.pipe(map((params) => tagPeriodOf(params.get('period')))),
    { initialValue: tagPeriodOf(this.route.snapshot.queryParamMap.get('period')) }
  )

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
    void this.tags.load()
    effect(() => {
      const tag = this.tag()
      untracked(() => this.store.open(tag))
    })
    effect(() => {
      const range = tagRangeOf(this.datePeriod(), this.months.current())
      untracked(() => this.store.setRange(range))
    })
  }

  protected choosePeriod(period: TagPeriod): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { period: period === 'all' ? null : period },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  /**
   * Renames (or merges) the tag everywhere, then opens it under its new
   * name: the months it spans change, so every list and total reads again.
   */
  protected rename(): void {
    const tag = this.tag()
    this.sheets
      .open<RenamedTag, RenameTagData>(RenameTagSheetComponent, {
        data: { tag, known: this.tags.names() },
        injector: this.injector,
      })
      .closed.subscribe((renamed) => {
        if (!renamed) {
          return
        }
        const detail = this.detail()
        for (const month of detail ? tagPeriod(detail.firstDate, detail.lastDate) : []) {
          this.months.invalidate(month)
        }
        void this.tags.refresh()
        this.toasts.show({
          /** t(tags.toast.renamed, tags.toast.merged) */
          messageKey: renamed.merged ? 'tags.toast.merged' : 'tags.toast.renamed',
          params: { name: renamed.tag, count: renamed.updated },
          status: 'good',
        })
        void this.router.navigate(['/tags', renamed.tag], {
          queryParamsHandling: 'preserve',
          replaceUrl: true,
        })
      })
  }
}
