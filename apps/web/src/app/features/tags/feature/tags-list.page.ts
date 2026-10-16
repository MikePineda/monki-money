import { Component, computed, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { TagsStore } from '../../../core/ledger/tags.store'
import { formatMoney } from '../../../domain/money'
import { label as monthLabel } from '../../../domain/month'
import { tagPeriod } from '../../../domain/tags'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { provideTagsScope } from '../tags.scope'

/**
 * Keys read from TypeScript, relative to the `tags` scope:
 * t(tags.totals.spent, tags.totals.income, tags.totals.setAside)
 */
const TOTAL_KEYS = ['totals.spent', 'totals.income', 'totals.setAside']

interface TagRow {
  tag: string
  expenseCents: number
  count: number
  /** "Jul 2026 – Jan 2027" */
  period: string
  /** "Spent $130.00 · Set aside $800.00": spent always, the others when not zero. */
  totals: string
}

/**
 * Tags `/tags` (reached from More): every tag the household uses, most
 * recently used first, each with how many transactions carry it, the months
 * it spans and its totals (spent, income, set aside). A row opens the tag.
 * Without tags yet, the empty state says how to add one.
 */
@Component({
  selector: 'app-tags-list-page',
  imports: [
    AmountDisplayComponent,
    ButtonComponent,
    EmptyStateComponent,
    IconButtonComponent,
    IconComponent,
    RouterLink,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [provideTagsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-1 pl-1">
      <a
        appIconButton
        icon="arrow-left"
        routerLink="/settings"
        [label]="'tags.back' | transloco"
      ></a>
      <h1 class="min-w-0 flex-1 truncate text-heading text-ink-1">
        {{ 'tags.title' | transloco }}
      </h1>
    </header>

    @switch (tags.status()) {
      @case ('loading') {
        <div class="flex flex-col gap-3 px-4 pt-2" data-testid="tags.loading" role="status">
          <span class="sr-only">{{ 'tags.loading' | transloco }}</span>
          @for (item of [1, 2, 3]; track item) {
            <app-skeleton height="72px" />
          }
        </div>
      }
      @case ('error') {
        <app-empty-state
          data-testid="tags.error"
          icon="wifi-off"
          [title]="'tags.error.title' | transloco"
          [body]="'tags.error.body' | transloco"
        >
          <button
            appButton
            type="button"
            variant="secondary"
            icon="refresh-cw"
            (click)="tags.refresh()"
          >
            {{ 'tags.error.retry' | transloco }}
          </button>
        </app-empty-state>
      }
      @default {
        @if (rows().length === 0) {
          <app-empty-state
            data-testid="tags.empty"
            icon="tag"
            [title]="'tags.empty.title' | transloco"
            [body]="'tags.empty.body' | transloco"
          >
            <a appButton variant="secondary" routerLink="/transactions">{{
              'tags.empty.action' | transloco
            }}</a>
          </app-empty-state>
        } @else {
          <ul class="flex flex-col pb-8" data-testid="tags.list">
            @for (row of rows(); track row.tag) {
              <li>
                <a
                  class="flex items-center gap-3 border-b border-line px-4 py-3 active:bg-surface-2"
                  data-testid="tags.row"
                  [routerLink]="['/tags', row.tag]"
                >
                  <span
                    class="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-1"
                  >
                    <app-icon name="tag" />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="truncate text-body text-ink-1" data-testid="tags.row.name">{{
                      row.tag
                    }}</span>
                    <span class="truncate text-caption text-ink-3"
                      >{{ 'tags.count' | transloco: { count: row.count } }}
                      @if (row.period) {
                        · {{ row.period }}
                      }
                    </span>
                    <span class="text-caption text-ink-2 tnum" data-testid="tags.row.totals">{{
                      row.totals
                    }}</span>
                  </span>
                  <app-amount-display class="shrink-0" [cents]="row.expenseCents" />
                </a>
              </li>
            }
          </ul>
        }
      }
    }
  `,
})
export default class TagsListPage {
  protected readonly tags = inject(TagsStore)
  private readonly locale = inject(APP_LOCALE)

  private readonly totalLabels = translateSignal(TOTAL_KEYS)

  protected readonly rows = computed<TagRow[]>(() => {
    const [spent = '', income = '', setAside = ''] = this.totalLabels()
    const locale = this.locale()
    const money = (cents: number) => formatMoney(cents, locale)
    return this.tags.tags().map((tag) => {
      const period = tagPeriod(tag.firstDate, tag.lastDate)
        .map((month) => monthLabel(month, locale, { withYear: true }))
        .join(' – ')
      const totals = [
        `${spent} ${money(tag.expenseCents)}`,
        ...(tag.incomeCents !== 0 ? [`${income} ${money(tag.incomeCents)}`] : []),
        ...(tag.setAsideCents !== 0 ? [`${setAside} ${money(tag.setAsideCents)}`] : []),
      ]
      return {
        tag: tag.tag,
        expenseCents: tag.expenseCents,
        count: tag.count,
        period,
        totals: totals.join(' · '),
      }
    })
  })

  constructor() {
    void this.tags.load()
  }
}
