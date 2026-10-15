import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core'
import { TranslocoPipe, provideTranslocoScope, translateSignal } from '@jsverse/transloco'
import { MonthStore } from '../../../../core/month/month.store'
import { label as monthLabel, yearOf, type YearMonth } from '../../../../domain/month'
import { relativeTime } from '../../../../domain/relative-time'
import { IconComponent } from '../../../../shared/icons/icon.component'
import type { IconName } from '../../../../shared/icons/icon-names'
import { APP_LOCALE } from '../../../../shared/ui/app-locale.token'
import { BottomSheetService } from '../../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../../shared/ui/button/button.component'
import { CardComponent } from '../../../../shared/ui/card/card.component'
import { IconButtonComponent } from '../../../../shared/ui/icon-button/icon-button.component'
import { MarkdownLiteComponent } from '../../../../shared/ui/markdown-lite/markdown-lite.component'
import { openSelectSheet } from '../../../../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../../../../shared/ui/skeleton/skeleton.component'
import { STATUS_ICON, STATUS_TEXT_CLASS } from '../../../../shared/ui/status-icon'
import { InsightsStore, type GenerateFailure } from '../../data-access/insights.store'

type Tone = 'positive' | 'neutral' | 'warning'

/**
 * Keys picked at runtime, declared for transloco-keys-manager:
 * t(insights.tone.positive, insights.tone.neutral, insights.tone.warning)
 * t(insights.noActivity, insights.future, insights.quota, insights.unavailable)
 * t(insights.notice.noActivity, insights.notice.future, insights.notice.quota)
 * t(insights.notice.unavailable, insights.notice.error, insights.menu, insights.regenerate)
 */
const MENU_KEYS = ['menu', 'regenerate']

const TONE_ICON: Record<Tone, IconName> = {
  positive: STATUS_ICON.good,
  neutral: 'info',
  warning: STATUS_ICON.warning,
}

const TONE_CLASS: Record<Tone, string> = {
  positive: STATUS_TEXT_CLASS.good,
  neutral: 'text-ink-2',
  warning: STATUS_TEXT_CLASS.warning,
}

/** How often "Updated 5 minutes ago" is refreshed. */
const CLOCK_TICK_MS = 60_000

/**
 * The LLM-written summary of a month, in the insights slot of the Month
 * view (DESIGN.md, Card). States:
 * - no summary yet: "Get your summary for {month}" with one Generate button;
 * - loading or writing: skeleton lines (writing also says so);
 * - ready: headline, the Markdown body (rendered through templates only),
 *   highlights with a status icon plus a tone word (never colour alone),
 *   "Written by AI · Updated {time}" and an overflow menu with Regenerate;
 * - no activity, a future month, the AI quota used up or summaries switched
 *   off: one quiet line; a failed load: a message with Try again.
 * A failed regenerate keeps the summary and says why under it.
 */
@Component({
  selector: 'app-insight-summary-card',
  imports: [
    ButtonComponent,
    CardComponent,
    IconButtonComponent,
    IconComponent,
    MarkdownLiteComponent,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [
    provideTranslocoScope({
      scope: 'insights',
      loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
    }),
  ],
  template: `
    <app-card data-testid="month.summary" class="gap-3!">
      <div class="flex min-h-5 items-center justify-between gap-2">
        <p class="text-eyebrow text-ink-2 uppercase">{{ 'insights.eyebrow' | transloco }}</p>
        @if (ready()) {
          <button
            appIconButton
            type="button"
            icon="ellipsis"
            class="-my-3 -mr-3"
            data-testid="month.summary.menu"
            [label]="'insights.menu' | transloco"
            (click)="openMenu()"
          ></button>
        }
      </div>

      @switch (view().status) {
        @case ('loading') {
          <div data-testid="month.summary.loading" role="status" class="flex flex-col gap-2">
            <span class="sr-only">{{ 'insights.loading' | transloco }}</span>
            <app-skeleton width="80%" height="24px" />
            <app-skeleton height="16px" />
            <app-skeleton width="60%" height="16px" />
          </div>
        }
        @case ('generating') {
          <div data-testid="month.summary.generating" role="status" class="flex flex-col gap-2">
            <p class="text-caption text-ink-3">{{ 'insights.generating' | transloco }}</p>
            <app-skeleton width="80%" height="24px" />
            <app-skeleton height="16px" />
            <app-skeleton height="16px" />
            <app-skeleton width="60%" height="16px" />
          </div>
        }
        @case ('missing') {
          <div data-testid="month.summary.missing" class="flex flex-col items-start gap-2">
            <h3 class="text-heading text-balance text-ink-1">
              {{ 'insights.missing.title' | transloco: { month: monthName() } }}
            </h3>
            <p class="text-body text-ink-2">{{ 'insights.missing.body' | transloco }}</p>
            <button
              appButton
              type="button"
              variant="secondary"
              icon="file-text"
              class="mt-1"
              data-testid="month.summary.generate"
              (click)="generate()"
            >
              {{ 'insights.missing.action' | transloco }}
            </button>
          </div>
        }
        @case ('error') {
          <div data-testid="month.summary.error" role="alert" class="flex flex-col items-start">
            <p class="flex items-start gap-2 text-body text-ink-1">
              <app-icon name="circle-alert" class="mt-0.5 shrink-0 text-status-critical" />
              <span>{{ 'insights.error' | transloco }}</span>
            </p>
            <button
              appButton
              type="button"
              variant="link"
              class="-ml-3"
              data-testid="month.summary.retry"
              (click)="retry()"
            >
              {{ 'insights.retry' | transloco }}
            </button>
          </div>
        }
        @case ('ready') {
          @if (ready(); as current) {
            <h3 data-testid="month.summary.headline" class="text-heading text-balance text-ink-1">
              {{ current.insight.headline }}
            </h3>
            <app-markdown-lite
              data-testid="month.summary.body"
              [source]="current.insight.bodyMarkdown"
            />
            @if (current.insight.highlights.length > 0) {
              <ul class="flex flex-col gap-2" [attr.aria-label]="'insights.highlights' | transloco">
                @for (highlight of current.insight.highlights; track $index) {
                  <li
                    data-testid="month.summary.highlight"
                    class="flex items-start gap-2 text-body text-ink-1"
                    [attr.data-tone]="highlight.tone"
                  >
                    <app-icon
                      class="mt-0.5 shrink-0"
                      [name]="toneIcon(highlight.tone)"
                      [class]="toneClass(highlight.tone)"
                    />
                    <span
                      ><span class="sr-only">{{ toneKey(highlight.tone) | transloco }} </span
                      >{{ highlight.text }}</span
                    >
                  </li>
                }
              </ul>
            }
            @if (current.notice; as notice) {
              <p
                data-testid="month.summary.notice"
                role="status"
                class="flex items-start gap-2 text-label text-ink-2"
              >
                <app-icon
                  class="shrink-0"
                  [name]="noticeIcon(notice)"
                  [class]="noticeClass(notice)"
                  [size]="16"
                />
                <span>{{ 'insights.notice.' + notice | transloco }}</span>
              </p>
            }
            <p data-testid="month.summary.updated" class="text-caption text-ink-3">
              {{ 'insights.updated' | transloco: { time: updatedAgo() } }}
            </p>
          }
        }
        @default {
          <p
            data-testid="month.summary.quiet"
            role="status"
            class="flex items-start gap-2 text-body text-ink-2"
          >
            <app-icon class="mt-0.5 shrink-0" [name]="quietIcon()" [class]="quietClass()" />
            <span>{{ 'insights.' + view().status | transloco: { month: monthName() } }}</span>
          </p>
        }
      }
    </app-card>
  `,
  host: { class: 'block' },
})
export class InsightSummaryCardComponent {
  protected readonly store = inject(InsightsStore)
  private readonly months = inject(MonthStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly locale = inject(APP_LOCALE)

  /** The month whose numbers are on screen ('YYYY-MM'). */
  readonly month = input.required<YearMonth>()

  private readonly menuLabels = translateSignal(MENU_KEYS)
  private readonly now = signal(new Date())

  protected readonly view = this.store.view
  protected readonly ready = computed(() => {
    const view = this.view()
    return view.status === 'ready' ? view : null
  })

  protected readonly monthName = computed(() =>
    monthLabel(this.month(), this.locale(), {
      long: true,
      withYear: yearOf(this.month()) !== yearOf(this.months.current()),
    })
  )

  protected readonly updatedAgo = computed(() => {
    const ready = this.ready()
    return ready ? relativeTime(ready.insight.generatedAt, this.now(), this.locale()) : ''
  })

  /** Quota used up reads as a warning; the other quiet states are information. */
  protected readonly quietIcon = computed<IconName>(() =>
    this.view().status === 'quota' ? STATUS_ICON.warning : 'info'
  )
  protected readonly quietClass = computed(() =>
    this.view().status === 'quota' ? STATUS_TEXT_CLASS.warning : 'text-ink-2'
  )

  constructor() {
    effect(() => {
      const month = this.month()
      untracked(() => this.store.show(month))
    })
    const clock = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS)
    inject(DestroyRef).onDestroy(() => clearInterval(clock))
  }

  protected generate(): void {
    void this.store.generate()
  }

  protected retry(): void {
    void this.store.retry()
  }

  protected openMenu(): void {
    const [title = '', regenerate = ''] = this.menuLabels()
    openSelectSheet(this.sheets, {
      title,
      options: [{ value: 'regenerate' as const, label: regenerate, icon: 'refresh-cw' }],
    }).subscribe((choice) => {
      if (choice === 'regenerate') {
        void this.store.generate(true)
      }
    })
  }

  protected toneIcon(tone: Tone): IconName {
    return TONE_ICON[tone]
  }

  protected toneClass(tone: Tone): string {
    return TONE_CLASS[tone]
  }

  protected toneKey(tone: Tone): string {
    return `insights.tone.${tone}`
  }

  protected noticeIcon(notice: GenerateFailure): IconName {
    return notice === 'error'
      ? STATUS_ICON.critical
      : notice === 'quota'
        ? STATUS_ICON.warning
        : 'info'
  }

  protected noticeClass(notice: GenerateFailure): string {
    return notice === 'error'
      ? STATUS_TEXT_CLASS.critical
      : notice === 'quota'
        ? STATUS_TEXT_CLASS.warning
        : 'text-ink-2'
  }
}
