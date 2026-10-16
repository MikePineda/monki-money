import { CdkDragHandle } from '@angular/cdk/drag-drop'
import { Component, computed, inject, input, output } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { CLOCK } from '../../../core/platform/clock.token'
import { HOUSEHOLD_TIME_ZONE } from '../../../core/platform/time-zone.token'
import {
  goalOutlook,
  progressOf,
  reachedOnText,
  readsReached,
  targetPace,
} from '../../../domain/goals'
import { formatMoney } from '../../../domain/money'
import { label as monthLabel, monthOf } from '../../../domain/month'
import { IconComponent } from '../../../shared/icons/icon.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { ProgressTrackComponent } from '../../../shared/ui/progress-track/progress-track.component'
import { STATUS_ICON, STATUS_TEXT_CLASS } from '../../../shared/ui/status-icon'
import type { GoalRow } from '../goals-list.store'

/**
 * Keys picked at runtime, declared for transloco-keys-manager:
 * t(goals.card.reached, goals.card.archived, goals.card.needsPlan, goals.card.unknown)
 * t(goals.card.projected, goals.card.onTrack, goals.card.behind)
 * t(goals.card.reachedOn, goals.card.ready)
 */
interface Outlook {
  key: string
  params?: Record<string, string>
}

/**
 * One goal in the list (DESIGN.md, Card): name, saved vs target with a
 * progress track (tabular figures), when it is projected ("Needs a plan"
 * when open-ended), whose goal it is, and an on-track / behind mark (icon
 * plus word) when it has a target date. A goal marked reached, or still
 * active with nothing left to save, wears a "Reached" badge instead (and
 * says the day it was reached, or that it can be marked). The body links
 * to the detail; a drag handle reorders it, and in reorder mode ▲▼ do the
 * same.
 */
@Component({
  selector: 'app-goal-card',
  imports: [
    CdkDragHandle,
    IconButtonComponent,
    IconComponent,
    ProgressTrackComponent,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <span
      cdkDragHandle
      class="grid w-9 shrink-0 cursor-grab touch-none place-items-center text-ink-3"
      aria-hidden="true"
    >
      <app-icon name="grip-vertical" />
    </span>
    <a
      class="flex min-w-0 flex-1 flex-col gap-2 py-4 pr-4 focus-visible:outline-offset-[-2px]"
      data-testid="goals.card.link"
      [routerLink]="['/goals', row().goal.id]"
    >
      <span class="flex items-start justify-between gap-3">
        <span class="min-w-0 truncate text-body-strong text-ink-1" data-testid="goals.card.name">{{
          row().goal.name
        }}</span>
        @if (reached()) {
          <span
            class="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm bg-surface-2 px-1.5 text-caption font-medium text-ink-1"
            data-testid="goals.card.badge"
          >
            <app-icon [name]="goodIcon" [size]="16" [class]="goodClass" />
            {{ 'goals.card.reached' | transloco }}
          </span>
        } @else if (pace(); as current) {
          <span
            class="flex shrink-0 items-center gap-1 text-label text-ink-1"
            data-testid="goals.card.pace"
            [attr.data-pace]="current"
          >
            <app-icon [name]="paceIcon()" [size]="16" [class]="paceClass()" />
            {{ (current === 'onTrack' ? 'goals.card.onTrack' : 'goals.card.behind') | transloco }}
          </span>
        }
      </span>
      <span class="flex items-baseline justify-between gap-3 text-amount tnum text-ink-1">
        <span data-testid="goals.card.progress">{{
          'goals.card.progress' | transloco: { saved: saved(), target: target() }
        }}</span>
        <span class="shrink-0 text-caption text-ink-3">{{
          'goals.card.percent' | transloco: { percent: percent() }
        }}</span>
      </span>
      <app-progress-track
        [value]="ratio()"
        [label]="
          'goals.card.progressLabel' | transloco: { name: row().goal.name, percent: percent() }
        "
      />
      <span class="truncate text-caption text-ink-2" data-testid="goals.card.outlook">
        {{ outlook().key | transloco: outlook().params }} · {{ ownerLabel() }}
      </span>
    </a>
    @if (reorderMode()) {
      <span class="flex shrink-0 flex-col justify-center pr-1">
        <button
          appIconButton
          type="button"
          icon="arrow-up"
          data-testid="goals.card.up"
          [label]="'goals.card.up' | transloco: { name: row().goal.name }"
          [disabled]="!canMoveUp()"
          (click)="moved.emit(-1)"
        ></button>
        <button
          appIconButton
          type="button"
          icon="arrow-down"
          data-testid="goals.card.down"
          [label]="'goals.card.down' | transloco: { name: row().goal.name }"
          [disabled]="!canMoveDown()"
          (click)="moved.emit(1)"
        ></button>
      </span>
    }
  `,
  host: {
    'role': 'listitem',
    'class': 'flex items-stretch rounded-lg border border-line bg-surface-1 active:bg-surface-2',
    'data-testid': 'goals.card',
    '[attr.data-id]': 'row().goal.id',
  },
})
export class GoalCardComponent {
  private readonly locale = inject(APP_LOCALE)
  private readonly timeZone = inject(HOUSEHOLD_TIME_ZONE)
  private readonly clock = inject(CLOCK)

  protected readonly goodIcon = STATUS_ICON.good
  protected readonly goodClass = STATUS_TEXT_CLASS.good

  readonly row = input.required<GoalRow>()
  /** "Household", "You" or the partner's name. */
  readonly ownerLabel = input.required<string>()
  readonly reorderMode = input(false)
  readonly canMoveUp = input(true)
  readonly canMoveDown = input(true)
  readonly moved = output<-1 | 1>()

  private readonly savedCents = computed(
    () => this.row().projection?.savedCents ?? this.row().goal.startingCents
  )
  protected readonly ratio = computed(() =>
    progressOf(this.savedCents(), this.row().goal.targetCents)
  )
  protected readonly percent = computed(() => Math.floor(this.ratio() * 100))
  protected readonly saved = computed(() => formatMoney(this.savedCents(), this.locale()))
  protected readonly target = computed(() =>
    formatMoney(this.row().goal.targetCents, this.locale())
  )

  /** Marked reached, or active with nothing left to save: the "Reached" badge. */
  protected readonly reached = computed(() =>
    readsReached(this.row().goal.status, this.row().projection)
  )
  protected readonly pace = computed(() => {
    const projection = this.row().projection
    return projection && this.row().goal.status === 'active' ? targetPace(projection) : null
  })
  protected readonly paceIcon = computed(() =>
    this.pace() === 'onTrack' ? STATUS_ICON.good : STATUS_ICON.warning
  )
  protected readonly paceClass = computed(() =>
    this.pace() === 'onTrack' ? STATUS_TEXT_CLASS.good : STATUS_TEXT_CLASS.warning
  )

  protected readonly outlook = computed<Outlook>(() => {
    const { goal, projection } = this.row()
    if (goal.status === 'reached') {
      const date = reachedOnText(goal.reachedAt, this.locale(), this.timeZone(), this.clock())
      return date
        ? { key: 'goals.card.reachedOn', params: { date } }
        : { key: 'goals.card.reached' }
    }
    if (goal.status === 'archived') {
      return { key: 'goals.card.archived' }
    }
    if (!projection) {
      return { key: 'goals.card.unknown' }
    }
    switch (goalOutlook(projection)) {
      case 'reached':
        return { key: 'goals.card.ready' }
      case 'openEnded':
        return { key: 'goals.card.needsPlan' }
      default: {
        const date = projection.projectedDate
        const month = date ? monthLabel(monthOf(date), this.locale(), { withYear: true }) : ''
        return { key: 'goals.card.projected', params: { date: month } }
      }
    }
  })
}
