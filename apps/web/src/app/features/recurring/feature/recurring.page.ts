import { NgTemplateOutlet } from '@angular/common'
import { Component, Injector, computed, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import type { RecurringItem } from '../../../core/api/api-types'
import { formatDayMonth } from '../../../domain/dates'
import { formatMoney } from '../../../domain/money'
import { actionsFor, type RecurringAction } from '../../../domain/recurring'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { PersonDotComponent, type Person } from '../../../shared/ui/person-dot/person-dot.component'
import { openSelectSheet } from '../../../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { RecurringStore } from '../recurring.store'
import { provideRecurringScope } from '../recurring.scope'
import { RecurringSheetComponent, type RecurringSheetData } from '../ui/recurring.sheet'

/**
 * Keys read from TypeScript:
 * t(recurring.next, recurring.noCategory)
 * t(recurring.actions.edit, recurring.actions.pause, recurring.actions.resume)
 * t(recurring.actions.dismiss, recurring.actions.restore)
 */
const ACTION_ICONS: Record<RecurringAction, IconName> = {
  edit: 'pencil',
  pause: 'circle-dashed',
  resume: 'rotate-ccw',
  dismiss: 'x',
  restore: 'archive-restore',
}

/** A key of this scope, read only to know when the catalogue is in: t(recurring.title) */
const CATALOGUE_PROBE = 'title'

interface RecurringView {
  item: RecurringItem
  icon: IconName
  /** "Weekly · Next 20 Oct · Rent". */
  meta: string
  amount: string
  person: Person
}

/**
 * Recurring payments `/recurring` (reached from More): rent, phone, gym and
 * subscriptions, found in the ledger or typed by hand. Active ones first
 * (next due date first), then paused and dismissed ones under their own
 * headings. Tap one to edit it (amount, frequency, category, who pays),
 * pause or resume it, or dismiss it ("not a bill": detection never brings
 * it back). "Detect again" and "Add manually" sit at the top; an empty
 * list explains that detection needs about three payments.
 */
@Component({
  selector: 'app-recurring-page',
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    IconButtonComponent,
    IconComponent,
    NgTemplateOutlet,
    PersonDotComponent,
    RouterLink,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [RecurringStore, provideRecurringScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-1 pl-1">
      <a
        appIconButton
        icon="arrow-left"
        routerLink="/settings"
        [label]="'recurring.back' | transloco"
      ></a>
      <h1 class="min-w-0 flex-1 truncate text-title text-ink-1">
        {{ 'recurring.title' | transloco }}
      </h1>
      <button
        appIconButton
        type="button"
        icon="plus"
        data-testid="recurring.add"
        [label]="'recurring.add' | transloco"
        (click)="add()"
      ></button>
    </header>

    <div class="flex flex-col gap-1 px-4 pb-4">
      <p class="text-body text-ink-2">{{ 'recurring.intro' | transloco }}</p>
      @if (!store.isEmpty()) {
        <button
          appButton
          type="button"
          variant="link"
          icon="refresh-cw"
          class="-ml-3 self-start"
          data-testid="recurring.detect"
          [disabled]="store.detecting()"
          (click)="store.detect()"
        >
          {{ (store.detecting() ? 'recurring.detecting' : 'recurring.detect') | transloco }}
        </button>
      }
    </div>

    @if (store.firstLoad()) {
      <div class="flex flex-col gap-2 px-4" role="status">
        <span class="sr-only">{{ 'recurring.loading' | transloco }}</span>
        @for (item of [1, 2, 3]; track item) {
          <app-skeleton height="64px" />
        }
      </div>
    } @else if (store.failed()) {
      <app-empty-state
        icon="wifi-off"
        data-testid="recurring.error"
        [title]="'recurring.error.title' | transloco"
        [body]="'recurring.error.body' | transloco"
      >
        <button
          appButton
          type="button"
          variant="secondary"
          icon="refresh-cw"
          (click)="store.retry()"
        >
          {{ 'errors.retry' | transloco }}
        </button>
      </app-empty-state>
    } @else if (store.isEmpty()) {
      <app-empty-state
        icon="calendar"
        data-testid="recurring.empty"
        [title]="'recurring.empty.title' | transloco"
        [body]="'recurring.empty.body' | transloco"
      >
        <div class="flex flex-wrap justify-center gap-2">
          <button
            appButton
            type="button"
            variant="secondary"
            icon="refresh-cw"
            data-testid="recurring.empty.detect"
            [disabled]="store.detecting()"
            (click)="store.detect()"
          >
            {{ 'recurring.empty.detect' | transloco }}
          </button>
          <button appButton type="button" variant="ghost" icon="plus" (click)="add()">
            {{ 'recurring.add' | transloco }}
          </button>
        </div>
      </app-empty-state>
    } @else {
      <ng-template #rows let-views>
        <ul class="flex flex-col pb-4">
          @for (view of views; track view.item.id) {
            <li class="border-b border-line">
              <button
                type="button"
                class="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2"
                data-testid="recurring.row"
                [attr.data-id]="view.item.id"
                [attr.data-status]="view.item.status"
                [class.opacity-60]="view.item.status !== 'active'"
                (click)="actions(view.item)"
              >
                <span
                  class="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-1"
                >
                  <app-icon [name]="view.icon" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span
                    class="flex min-w-0 items-center gap-1.5 truncate text-body text-ink-1"
                    data-testid="recurring.payee"
                  >
                    @if (view.person !== 'joint') {
                      <app-person-dot [person]="view.person" />
                    }
                    {{ view.item.payee }}
                  </span>
                  <span class="truncate text-caption text-ink-3" data-testid="recurring.meta">{{
                    view.meta
                  }}</span>
                </span>
                <span class="shrink-0 text-body tnum text-ink-1" data-testid="recurring.amount">{{
                  view.amount
                }}</span>
              </button>
            </li>
          }
        </ul>
      </ng-template>

      <section data-testid="recurring.list" [attr.aria-label]="'recurring.title' | transloco">
        <ng-container
          [ngTemplateOutlet]="rows"
          [ngTemplateOutletContext]="{ $implicit: views().active }"
        />
      </section>
      @if (views().paused.length > 0) {
        <section data-testid="recurring.paused">
          <h2 class="px-4 pt-2 pb-1 text-eyebrow uppercase text-ink-2">
            {{ 'recurring.sections.paused' | transloco }}
          </h2>
          <ng-container
            [ngTemplateOutlet]="rows"
            [ngTemplateOutletContext]="{ $implicit: views().paused }"
          />
        </section>
      }
      @if (views().dismissed.length > 0) {
        <section data-testid="recurring.dismissed">
          <h2 class="px-4 pt-2 pb-1 text-eyebrow uppercase text-ink-2">
            {{ 'recurring.sections.dismissed' | transloco }}
          </h2>
          <ng-container
            [ngTemplateOutlet]="rows"
            [ngTemplateOutletContext]="{ $implicit: views().dismissed }"
          />
        </section>
      }
    }
  `,
  host: { class: 'block' },
})
export default class RecurringPage {
  protected readonly store = inject(RecurringStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly injector = inject(Injector)
  private readonly locale = inject(APP_LOCALE)
  private readonly catalogue = translateSignal(CATALOGUE_PROBE)

  protected readonly views = computed(() => {
    this.catalogue()
    const { active, paused, dismissed } = this.store.sections()
    return {
      active: active.map((item) => this.viewOf(item)),
      paused: paused.map((item) => this.viewOf(item)),
      dismissed: dismissed.map((item) => this.viewOf(item)),
    }
  })

  protected add(): void {
    this.openSheet({})
  }

  protected actions(item: RecurringItem): void {
    openSelectSheet<RecurringAction>(this.sheets, {
      title: item.payee,
      options: actionsFor(item.status).map((action) => ({
        value: action,
        label: this.t(`recurring.actions.${action}`),
        icon: ACTION_ICONS[action],
      })),
    }).subscribe((action) => {
      if (action === 'edit') {
        this.openSheet({ item })
      } else if (action !== undefined) {
        void this.store.act(item, action)
      }
    })
  }

  private openSheet(data: RecurringSheetData): void {
    this.sheets.open<boolean, RecurringSheetData>(RecurringSheetComponent, {
      data,
      injector: this.injector,
    })
  }

  private viewOf(item: RecurringItem): RecurringView {
    const directory = this.store.directory
    const category = directory.category(item.categoryId)
    const meta = [
      this.t(`recurring.cadence.${item.cadence}`),
      item.status === 'dismissed'
        ? ''
        : this.t('recurring.next', { date: formatDayMonth(item.nextExpectedDate, this.locale()) }),
      category?.category.name ?? this.t('recurring.noCategory'),
    ]
    return {
      item,
      icon: category ? categoryIcon(category.category) : 'calendar',
      meta: meta.filter(Boolean).join(' · '),
      amount: formatMoney(item.amountCents, this.locale()),
      person: directory.personOf(item.paidByUserId),
    }
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.transloco.translate(key, params)
  }
}
