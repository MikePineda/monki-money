import { Component, Injector, computed, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import type { MerchantRule } from '../../../core/api/api-types'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { openConfirmSheet } from '../../../shared/ui/confirm-sheet/confirm-sheet.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { openSelectSheet } from '../../../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { RulesStore } from '../rules.store'
import { provideRulesScope } from '../rules.scope'
import { RuleSheetComponent, type RuleSheetData } from './rule.sheet'

type RuleAction = 'edit' | 'apply' | 'delete'

interface RuleView {
  rule: MerchantRule
  icon: IconName
  /** "Groceries" or "Transfer to NAB Savings". */
  target: string
  /** "Merchant · 3 matches · Learned". */
  meta: string
}

/**
 * Keys read from TypeScript:
 * t(rules.matchType.merchant, rules.matchType.contains, rules.matchType.regex)
 * t(rules.origin.user, rules.origin.learned, rules.origin.system)
 * t(rules.hits, rules.transferTo, rules.noTarget, rules.actions.title)
 * t(rules.actions.edit, rules.actions.apply, rules.actions.delete, rules.deleteSheet.title)
 * t(rules.deleteSheet.body, rules.deleteSheet.confirm, rules.deleteSheet.keep)
 */
const KEYS = {
  hits: 'rules.hits',
  transferTo: 'rules.transferTo',
  noTarget: 'rules.noTarget',
  actionsTitle: 'rules.actions.title',
  edit: 'rules.actions.edit',
  apply: 'rules.actions.apply',
  delete: 'rules.actions.delete',
}

/** A key of this scope, read only to know when the catalogue is in: t(rules.title) */
const CATALOGUE_PROBE = 'title'

/**
 * Merchant rules `/settings/rules`: what sorts imported movements. Each row
 * shows the pattern, how it matches, its category (or transfer account),
 * how often it matched and who made it (you, learned from an import, or the
 * bank defaults). "New rule" writes one by hand; tap a rule to edit it, to
 * apply it to the transactions still in review, or to delete it (asked
 * first). Rules are also learned in the import and transaction flows.
 */
@Component({
  selector: 'app-rules-page',
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    IconButtonComponent,
    IconComponent,
    RouterLink,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [RulesStore, provideRulesScope()],
  template: `
    <header class="flex h-14 items-center gap-1 pr-4 pl-1">
      <a
        appIconButton
        icon="arrow-left"
        routerLink="/settings"
        [label]="'rules.back' | transloco"
      ></a>
      <h1 class="truncate text-title text-ink-1">{{ 'rules.title' | transloco }}</h1>
    </header>

    <p class="px-4 pb-4 text-body text-ink-2">{{ 'rules.intro' | transloco }}</p>

    @if (!store.firstLoad() && !store.failed()) {
      <div class="px-4 pb-4">
        <button
          appButton
          type="button"
          icon="plus"
          size="block"
          data-testid="rules.new"
          (click)="write(null)"
        >
          {{ 'rules.new' | transloco }}
        </button>
      </div>
    }

    @if (store.firstLoad()) {
      <div class="flex flex-col gap-2 px-4" role="status">
        <span class="sr-only">{{ 'rules.loading' | transloco }}</span>
        @for (item of [1, 2, 3, 4]; track item) {
          <app-skeleton height="56px" />
        }
      </div>
    } @else if (store.failed()) {
      <app-empty-state
        icon="wifi-off"
        data-testid="rules.error"
        [title]="'rules.error.title' | transloco"
        [body]="'rules.error.body' | transloco"
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
    } @else if (views().length === 0) {
      <app-empty-state
        icon="list"
        data-testid="rules.empty"
        [title]="'rules.empty.title' | transloco"
        [body]="'rules.empty.body' | transloco"
      >
        <a appButton variant="secondary" icon="file-up" routerLink="/import">
          {{ 'rules.empty.action' | transloco }}
        </a>
      </app-empty-state>
    } @else {
      <ul
        class="flex flex-col pb-6"
        data-testid="rules.list"
        [attr.aria-label]="'rules.title' | transloco"
      >
        @for (view of views(); track view.rule.id) {
          <li class="border-b border-line">
            <button
              type="button"
              class="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left active:bg-surface-2"
              data-testid="rules.row"
              [attr.data-id]="view.rule.id"
              [attr.aria-busy]="store.applying() === view.rule.id || null"
              (click)="actions(view.rule)"
            >
              <span
                class="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-1"
              >
                <app-icon [name]="view.icon" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-body text-ink-1" data-testid="rules.pattern">{{
                  view.rule.pattern
                }}</span>
                <span class="truncate text-caption text-ink-2">{{ view.target }}</span>
                <span class="truncate text-caption text-ink-3">{{ view.meta }}</span>
              </span>
              @if (store.applying() === view.rule.id) {
                <app-icon name="loader-circle" class="animate-spin text-ink-2" />
              } @else {
                <app-icon name="ellipsis" class="text-ink-2" />
              }
            </button>
          </li>
        }
      </ul>
    }
  `,
  host: { class: 'block' },
})
export default class RulesPage {
  protected readonly store = inject(RulesStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly injector = inject(Injector)
  private readonly catalogue = translateSignal(CATALOGUE_PROBE)

  protected readonly views = computed<RuleView[]>(() => {
    this.catalogue()
    const directory = this.store.directory
    return this.store.rules().map((rule) => {
      const category = rule.categoryId === null ? null : directory.category(rule.categoryId)
      const account =
        rule.transferAccountId === null ? null : directory.account(rule.transferAccountId)
      const target = category
        ? category.category.name
        : account
          ? this.t(KEYS.transferTo, { account: account.name })
          : this.t(KEYS.noTarget)
      return {
        rule,
        icon: category ? categoryIcon(category.category) : account ? 'arrow-left-right' : 'tag',
        target,
        meta: [
          this.t(`rules.matchType.${rule.matchType}`),
          this.t(KEYS.hits, { count: rule.hitCount }),
          this.t(`rules.origin.${rule.origin}`),
        ].join(' · '),
      }
    })
  })

  protected actions(rule: MerchantRule): void {
    openSelectSheet<RuleAction>(this.sheets, {
      title: this.t(KEYS.actionsTitle, { pattern: rule.pattern }),
      options: [
        { value: 'edit', label: this.t(KEYS.edit), icon: 'pencil' },
        { value: 'apply', label: this.t(KEYS.apply), icon: 'refresh-cw' },
        { value: 'delete', label: this.t(KEYS.delete), icon: 'trash-2' },
      ],
    }).subscribe((action) => {
      if (action === 'edit') {
        this.write(rule)
      } else if (action === 'apply') {
        void this.store.apply(rule)
      } else if (action === 'delete') {
        this.confirmDelete(rule)
      }
    })
  }

  /** Opens the rule form: a new rule (null) or the given one, filled in. */
  protected write(rule: MerchantRule | null): void {
    // The page's injector carries the store and the `rules` scope.
    this.sheets.open<MerchantRule, RuleSheetData>(RuleSheetComponent, {
      data: { rule },
      injector: this.injector,
    })
  }

  private confirmDelete(rule: MerchantRule): void {
    openConfirmSheet(this.sheets, {
      title: this.t('rules.deleteSheet.title'),
      body: this.t('rules.deleteSheet.body', { pattern: rule.pattern }),
      confirmLabel: this.t('rules.deleteSheet.confirm'),
      cancelLabel: this.t('rules.deleteSheet.keep'),
      destructive: true,
    }).subscribe((confirmed) => {
      if (confirmed) {
        void this.store.remove(rule)
      }
    })
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.transloco.translate(key, params)
  }
}
