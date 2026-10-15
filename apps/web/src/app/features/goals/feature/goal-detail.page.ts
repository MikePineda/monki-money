import {
  Component,
  Injector,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { HouseholdDirectory } from '../../../core/household/household-directory.store'
import { MembersStore } from '../../../core/household/members.store'
import { formatDay } from '../../../domain/dates'
import {
  EMPTY_GOAL_DRAFT,
  draftFromGoal,
  goalOutlook,
  goalPayload,
  openEndedReason,
  progressOf,
  projectionPoints,
  targetPace,
  type GoalDraft,
  type GoalStatus,
} from '../../../domain/goals'
import { formatMoney } from '../../../domain/money'
import { label as monthLabel, monthOf } from '../../../domain/month'
import { ChartFrameComponent } from '../../../shared/charts/chart-frame/chart-frame.component'
import { ProjectionChartComponent } from '../../../shared/charts/projection-chart/projection-chart.component'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { CardComponent } from '../../../shared/ui/card/card.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { ProgressTrackComponent } from '../../../shared/ui/progress-track/progress-track.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { STATUS_ICON, STATUS_TEXT_CLASS } from '../../../shared/ui/status-icon'
import { GoalDetailStore } from '../goal-detail.store'
import { provideGoalsScope } from '../goals.scope'
import {
  DeleteGoalSheetComponent,
  type DeleteGoalSheetData,
} from '../ui/delete-goal-sheet.component'
import { GoalFormComponent, type GoalKeypad } from '../ui/goal-form.component'
import { GoalStatComponent } from '../ui/goal-stat.component'

/**
 * Keys picked at runtime, declared for transloco-keys-manager:
 * t(goals.detail.badge.reached, goals.detail.badge.archived)
 * t(goals.detail.pace.onTrack, goals.detail.pace.behind)
 * t(goals.detail.rateSource.average, goals.detail.rateSource.contribution)
 * t(goals.detail.rateSource.none, goals.detail.openEnded.noHistory)
 * t(goals.detail.openEnded.spendingMore, goals.detail.openEnded.zeroContribution)
 * t(goals.detail.openEnded.tooSlow, goals.detail.stats.none, goals.card.reached)
 */
const STAT_KEYS = ['detail.stats.none', 'card.reached']

/**
 * One goal `/goals/:id`: the hero (saved of target, what is left, the
 * progress track, on track or behind its date and what it would take per
 * month), the projection chart (target as a goal line, the target date as
 * a marker), three stat tiles (months to go, projected date, monthly rate
 * and where it comes from), and the actions: edit, mark as reached (or
 * active again), archive or restore, delete with a confirmation. A goal
 * with no usable rate says why honestly and offers to set a contribution.
 */
@Component({
  selector: 'app-goal-detail-page',
  imports: [
    AmountDisplayComponent,
    BannerComponent,
    ButtonComponent,
    CardComponent,
    ChartFrameComponent,
    EmptyStateComponent,
    GoalFormComponent,
    GoalStatComponent,
    IconButtonComponent,
    IconComponent,
    ProgressTrackComponent,
    ProjectionChartComponent,
    RouterLink,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [GoalDetailStore, provideGoalsScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-1 pl-1">
      <a appIconButton icon="arrow-left" routerLink="/goals" [label]="'goals.back' | transloco"></a>
      <h1 class="min-w-0 flex-1 truncate text-heading text-ink-1" data-testid="goal.name">
        @if (editing()) {
          {{ 'goals.form.editTitle' | transloco }}
        } @else {
          {{ detail()?.goal?.name ?? ('goals.title' | transloco) }}
        }
      </h1>
      @if (status() === 'ready' && !editing()) {
        <button
          appIconButton
          type="button"
          icon="pencil"
          data-testid="goal.edit"
          [label]="'goals.detail.edit' | transloco"
          (click)="edit()"
        ></button>
      }
    </header>

    @switch (status()) {
      @case ('loading') {
        <div class="flex flex-col gap-6 px-4 pt-2" data-testid="goal.loading" role="status">
          <span class="sr-only">{{ 'goals.detail.loading' | transloco }}</span>
          <div class="flex flex-col gap-2">
            <app-skeleton width="30%" height="16px" />
            <app-skeleton width="60%" height="48px" />
            <app-skeleton width="50%" height="20px" />
          </div>
          <app-skeleton height="200px" />
          <app-skeleton height="72px" />
        </div>
      }
      @case ('notFound') {
        <app-empty-state
          data-testid="goal.notFound"
          icon="piggy-bank"
          [title]="'goals.detail.notFound.title' | transloco"
          [body]="'goals.detail.notFound.body' | transloco"
        >
          <a appButton variant="secondary" routerLink="/goals">{{
            'goals.detail.notFound.back' | transloco
          }}</a>
        </app-empty-state>
      }
      @case ('error') {
        <app-banner
          class="mx-4 mt-2"
          data-testid="goal.error"
          status="critical"
          [message]="'goals.detail.error' | transloco"
          [actionLabel]="'goals.detail.retry' | transloco"
          (action)="store.retry()"
        />
      }
      @default {
        @if (detail(); as current) {
          @if (editing()) {
            <app-goal-form
              class="px-4 pt-2 pb-8"
              data-testid="goal.form"
              [initial]="editDraft()"
              [accounts]="directory.activeAccounts()"
              [partnerName]="partnerName()"
              [submitLabel]="'goals.form.save' | transloco"
              [busy]="store.busy()"
              [serverErrors]="errors()"
              [cancellable]="true"
              [startWith]="startWith()"
              (submitted)="save($event)"
              (cancelled)="editing.set(false)"
            />
          } @else {
            <div class="flex flex-col gap-8 px-4 pt-2 pb-8">
              <section
                data-testid="goal.hero"
                class="flex flex-col gap-2 border-b border-line pb-6"
              >
                <div class="flex items-center gap-2">
                  <p class="text-eyebrow text-ink-2 uppercase">
                    {{ 'goals.detail.eyebrow' | transloco }}
                  </p>
                  @if (current.goal.status !== 'active') {
                    <span
                      data-testid="goal.badge"
                      class="inline-flex h-5 items-center gap-1 rounded-sm bg-surface-2 px-1.5 text-caption font-medium text-ink-1"
                    >
                      <app-icon
                        [name]="current.goal.status === 'reached' ? goodIcon : 'archive'"
                        [size]="16"
                        [class]="current.goal.status === 'reached' ? goodClass : 'text-ink-2'"
                      />
                      {{ 'goals.detail.badge.' + current.goal.status | transloco }}
                    </span>
                  }
                </div>
                <app-amount-display
                  data-testid="goal.saved"
                  variant="hero"
                  [cents]="current.projection.savedCents"
                />
                <p class="text-body text-ink-2 tnum" data-testid="goal.target">
                  {{ 'goals.detail.of' | transloco: { target: money(current.goal.targetCents) } }}
                  ·
                  @if (outlook() === 'reached') {
                    {{ 'goals.detail.reached' | transloco }}
                  } @else {
                    {{
                      'goals.detail.remaining'
                        | transloco: { amount: money(current.projection.remainingCents) }
                    }}
                  }
                </p>
                <app-progress-track
                  class="mt-1"
                  [value]="ratio()"
                  [label]="'goals.detail.progressLabel' | transloco: { percent: percent() }"
                />
                @if (pace(); as paceNow) {
                  <p
                    data-testid="goal.pace"
                    class="mt-2 flex items-center gap-2 text-body text-ink-1"
                    [attr.data-pace]="paceNow"
                  >
                    <app-icon
                      class="shrink-0"
                      [name]="paceNow === 'onTrack' ? goodIcon : warningIcon"
                      [class]="paceNow === 'onTrack' ? goodClass : warningClass"
                    />
                    {{ 'goals.detail.pace.' + paceNow | transloco: { date: targetDateText() } }}
                  </p>
                }
                @if (requiredText(); as amount) {
                  <p data-testid="goal.required" class="text-body text-ink-2">
                    {{
                      'goals.detail.pace.required' | transloco: { date: targetDateText(), amount }
                    }}
                  </p>
                }
              </section>

              @if (outlook() === 'openEnded') {
                <app-card data-testid="goal.openEnded" class="gap-3!">
                  <h2 class="text-heading text-ink-1">
                    {{ 'goals.detail.openEnded.title' | transloco }}
                  </h2>
                  <p class="text-body text-ink-2">
                    {{ 'goals.detail.openEnded.' + reason() | transloco }}
                  </p>
                  <button
                    appButton
                    type="button"
                    variant="secondary"
                    class="self-start"
                    data-testid="goal.setContribution"
                    (click)="nudge()"
                  >
                    {{ 'goals.detail.openEnded.action' | transloco }}
                  </button>
                </app-card>
              } @else if (outlook() === 'projected') {
                <app-chart-frame
                  data-testid="goal.chart"
                  skeletonHeight="180px"
                  [title]="'goals.detail.chart.title' | transloco"
                  [subtitle]="'goals.detail.chart.subtitle' | transloco"
                >
                  <app-projection-chart
                    [history]="points().history"
                    [projection]="points().projection"
                    [thresholdCents]="current.goal.targetCents"
                    [markerMonth]="targetMonth()"
                  />
                </app-chart-frame>
              }

              <section
                data-testid="goal.stats"
                class="grid grid-cols-3 divide-x divide-line border-b border-line pb-6"
                [attr.aria-label]="'goals.detail.stats.label' | transloco"
              >
                <app-goal-stat
                  data-testid="goal.stats.months"
                  [label]="'goals.detail.stats.months' | transloco"
                  [value]="
                    monthsToGoal() === null
                      ? ('goals.detail.stats.none' | transloco)
                      : ('goals.detail.stats.monthsValue' | transloco: { count: monthsToGoal() })
                  "
                />
                <app-goal-stat
                  data-testid="goal.stats.date"
                  [label]="'goals.detail.stats.date' | transloco"
                  [value]="projectedText()"
                />
                <app-goal-stat
                  data-testid="goal.stats.rate"
                  [label]="'goals.detail.stats.rate' | transloco"
                  [value]="rateText()"
                  [detail]="'goals.detail.rateSource.' + current.projection.rateSource | transloco"
                />
              </section>

              <section
                data-testid="goal.actions"
                class="flex flex-col gap-2"
                [attr.aria-label]="'goals.detail.actions.label' | transloco"
              >
                @if (current.goal.status === 'active') {
                  <button
                    appButton
                    type="button"
                    variant="secondary"
                    icon="circle-check"
                    data-testid="goal.markReached"
                    [loading]="store.busy()"
                    (click)="setStatus('reached')"
                  >
                    {{ 'goals.detail.actions.reached' | transloco }}
                  </button>
                } @else if (current.goal.status === 'reached') {
                  <button
                    appButton
                    type="button"
                    variant="secondary"
                    icon="rotate-ccw"
                    data-testid="goal.reopen"
                    [loading]="store.busy()"
                    (click)="setStatus('active')"
                  >
                    {{ 'goals.detail.actions.reopen' | transloco }}
                  </button>
                }
                @if (current.goal.status === 'archived') {
                  <button
                    appButton
                    type="button"
                    variant="secondary"
                    icon="archive-restore"
                    data-testid="goal.restore"
                    [loading]="store.busy()"
                    (click)="setStatus('active')"
                  >
                    {{ 'goals.detail.actions.restore' | transloco }}
                  </button>
                } @else {
                  <button
                    appButton
                    type="button"
                    variant="secondary"
                    icon="archive"
                    data-testid="goal.archive"
                    [loading]="store.busy()"
                    (click)="setStatus('archived')"
                  >
                    {{ 'goals.detail.actions.archive' | transloco }}
                  </button>
                }
                <button
                  appButton
                  type="button"
                  variant="destructive"
                  data-testid="goal.delete"
                  (click)="remove()"
                >
                  {{ 'goals.detail.actions.delete' | transloco }}
                </button>
              </section>
            </div>
          }
        }
      }
    }
  `,
})
export default class GoalDetailPage {
  protected readonly store = inject(GoalDetailStore)
  protected readonly directory = inject(HouseholdDirectory)
  private readonly members = inject(MembersStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly router = inject(Router)
  private readonly injector = inject(Injector)
  private readonly locale = inject(APP_LOCALE)

  /** `/goals/:id`, bound by the router. */
  readonly id = input<string>()

  protected readonly goodIcon = STATUS_ICON.good
  protected readonly goodClass = STATUS_TEXT_CLASS.good
  protected readonly warningIcon = STATUS_ICON.warning
  protected readonly warningClass = STATUS_TEXT_CLASS.warning

  protected readonly editing = signal(false)
  protected readonly startWith = signal<GoalKeypad | null>(null)
  protected readonly editDraft = signal<GoalDraft>(EMPTY_GOAL_DRAFT)
  protected readonly errors = signal<Record<string, string>>({})

  private readonly statWords = translateSignal(STAT_KEYS)

  private readonly numericId = computed(() => {
    const id = Number(this.id())
    return Number.isSafeInteger(id) && id > 0 ? id : null
  })
  protected readonly status = computed(() =>
    this.numericId() === null ? 'notFound' : this.store.status()
  )
  protected readonly detail = this.store.detail
  protected readonly partnerName = computed(() => this.members.partner()?.name ?? null)

  private readonly projection = computed(() => this.detail()?.projection)
  protected readonly outlook = computed(() => {
    const projection = this.projection()
    return projection ? goalOutlook(projection) : null
  })
  protected readonly pace = computed(() => {
    const projection = this.projection()
    return projection && this.detail()?.goal.status === 'active' ? targetPace(projection) : null
  })
  protected readonly reason = computed(() => {
    const projection = this.projection()
    return projection ? openEndedReason(projection) : 'noHistory'
  })
  protected readonly ratio = computed(() => {
    const detail = this.detail()
    return detail ? progressOf(detail.projection.savedCents, detail.goal.targetCents) : 0
  })
  protected readonly percent = computed(() => Math.floor(this.ratio() * 100))
  protected readonly points = computed(() => projectionPoints(this.projection()?.series ?? []))
  protected readonly targetMonth = computed(() => {
    const date = this.detail()?.goal.targetDate
    return date ? monthOf(date) : null
  })
  protected readonly targetDateText = computed(() => {
    const date = this.detail()?.goal.targetDate
    return date ? formatDay(`${date}T00:00:00.000Z`, this.locale(), 'UTC') : ''
  })
  /** What it takes per month to make the date, shown only when behind. */
  protected readonly requiredText = computed(() => {
    const required = this.projection()?.requiredMonthlyForTargetDate
    return this.pace() === 'behind' && required ? this.money(required) : ''
  })

  /** Null while open-ended. */
  protected readonly monthsToGoal = computed(() => this.projection()?.monthsToGoal ?? null)
  protected readonly projectedText = computed(() => {
    const [none = '', reached = ''] = this.statWords()
    if (this.outlook() === 'reached') {
      return reached
    }
    const date = this.projection()?.projectedDate
    return date ? monthLabel(monthOf(date), this.locale(), { withYear: true }) : none
  })
  protected readonly rateText = computed(() => {
    const rate = this.projection()?.monthlyRateCents
    const [none = ''] = this.statWords()
    return rate === null || rate === undefined
      ? none
      : formatMoney(rate, this.locale(), { wholeDollars: true })
  })

  constructor() {
    void this.directory.load().catch(() => undefined)
    effect(() => {
      const id = this.numericId()
      if (id !== null) {
        untracked(() => this.store.open(id))
      }
    })
  }

  protected money(cents: number): string {
    return formatMoney(cents, this.locale())
  }

  protected edit(contribution = false): void {
    const goal = this.detail()?.goal
    if (!goal) {
      return
    }
    const draft = draftFromGoal(goal, this.people())
    this.editDraft.set(contribution ? { ...draft, contribution: 'fixed' } : draft)
    this.startWith.set(contribution ? 'contribution' : null)
    this.errors.set({})
    this.editing.set(true)
  }

  /** "Set a monthly contribution": the form opens on that keypad. */
  protected nudge(): void {
    this.edit(true)
  }

  protected async save(draft: GoalDraft): Promise<void> {
    const result = await this.store.save(goalPayload(draft, this.people()))
    if (result.ok) {
      this.editing.set(false)
    } else {
      this.errors.set(result.fields)
    }
  }

  protected setStatus(status: GoalStatus): void {
    void this.store.setStatus(status)
  }

  protected remove(): void {
    const name = this.detail()?.goal.name ?? ''
    this.sheets
      .open<boolean, DeleteGoalSheetData>(DeleteGoalSheetComponent, {
        data: { name },
        injector: this.injector,
      })
      .closed.subscribe(async (confirmed) => {
        if (confirmed && (await this.store.remove())) {
          await this.router.navigate(['/goals'], { replaceUrl: true })
        }
      })
  }

  private people() {
    return {
      youId: this.members.you()?.userId ?? null,
      partnerId: this.members.partner()?.userId ?? null,
    }
  }
}
