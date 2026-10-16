import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import type { RuleMatchType } from '@monkimoney/shared'
import type { MerchantRule } from '../../../core/api/api-types'
import { failureMessage } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import type { Person } from '../../../shared/ui/person-dot/person-dot.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../../shared/ui/segmented-control/segmented-control.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../../../shared/ui/select-sheet/select-sheet.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import {
  EMPTY_RULE_DRAFT,
  RULE_PATTERN_MAX_LENGTH,
  RULE_PAYEE_MAX_LENGTH,
  draftFromRule,
  formatPriority,
  isPatternLocked,
  ruleErrorsFrom,
  rulePatch,
  ruleProblems,
  stepPriority,
  type RuleDraft,
  type RuleErrors,
  type RuleField,
  type RuleTarget,
} from '../rule-draft'
import { RulesStore } from '../rules.store'

/**
 * Keys read from TypeScript. translateSignal() takes them relative to the
 * `rules` scope the page provides (the sheet opens with the page's
 * injector); sheet titles and messages take full keys.
 * t(rules.matchType.merchant, rules.matchType.contains, rules.matchType.regex)
 * t(rules.form.targets.category, rules.form.targets.transfer, rules.form.chooseCategory)
 * t(rules.form.chooseAccount, rules.form.defaultPayer, rules.form.you)
 * t(rules.form.newTitle, rules.form.editTitle)
 * t(rules.form.matchHelp.merchant, rules.form.matchHelp.contains, rules.form.matchHelp.regex)
 * t(rules.form.categoryTitle, rules.form.accountTitle, rules.form.paidBy)
 * t(rules.form.problems.patternRequired, rules.form.problems.patternTooLong)
 * t(rules.form.problems.targetRequired, rules.form.problems.payeeTooLong)
 */
const WORD_KEYS = [
  'matchType.merchant',
  'matchType.contains',
  'matchType.regex',
  'form.targets.category',
  'form.targets.transfer',
  'form.chooseCategory',
  'form.chooseAccount',
  'form.defaultPayer',
  'form.you',
]
const MATCH_TYPES: readonly RuleMatchType[] = ['merchant', 'contains', 'regex']
const TITLE_KEYS = {
  new: 'rules.form.newTitle',
  edit: 'rules.form.editTitle',
  category: 'rules.form.categoryTitle',
  account: 'rules.form.accountTitle',
  payer: 'rules.form.paidBy',
}

/** What a field's local problem reads like (full keys, with their parameters). */
const PROBLEM_MESSAGES: Record<string, { key: string; params?: Record<string, number> }> = {
  'pattern.required': { key: 'rules.form.problems.patternRequired' },
  'pattern.tooLong': {
    key: 'rules.form.problems.patternTooLong',
    params: { max: RULE_PATTERN_MAX_LENGTH },
  },
  'target.required': { key: 'rules.form.problems.targetRequired' },
  'payee.tooLong': {
    key: 'rules.form.problems.payeeTooLong',
    params: { max: RULE_PAYEE_MAX_LENGTH },
  },
}

export interface RuleSheetData {
  /** The rule to edit; null writes a new one. */
  rule: MerchantRule | null
}

/**
 * Writes a merchant rule or edits one, over the rules screen: how it
 * matches (merchant, contains or a regular expression, each explained in a
 * line), the text to match, what it does (a category or a transfer to an
 * account, exactly one), who paid and the name matched movements get
 * (both optional), and the priority folded under "More". A bank default
 * keeps its match type and pattern (see `isPatternLocked`). Problems the
 * form can see show on Save without calling the API; a 422 lands under the
 * field it names; anything else shows above the form. Closes with the
 * saved rule (the store has already updated the list and offered to apply
 * it).
 */
@Component({
  selector: 'app-rule-sheet',
  imports: [
    BannerComponent,
    BottomSheetComponent,
    ButtonComponent,
    ChipComponent,
    IconButtonComponent,
    IconComponent,
    SegmentedControlComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet [title]="title()" [closeLabel]="'ui.sheet.close' | transloco">
      <div class="flex flex-col gap-5 px-4 pb-4" data-testid="rules.form">
        @if (errors().form; as message) {
          <app-banner status="critical" data-testid="rules.form.error" [message]="message" />
        }

        @if (locked) {
          <p class="text-body text-ink-2" data-testid="rules.form.locked">
            {{ 'rules.form.locked' | transloco: { pattern: draft().pattern } }}
          </p>
        } @else {
          <div class="flex flex-col gap-2">
            <span class="text-label text-ink-2">{{ 'rules.form.matchType' | transloco }}</span>
            <app-segmented-control
              data-testid="rules.form.matchType"
              [label]="'rules.form.matchType' | transloco"
              [options]="matchTypes()"
              [value]="draft().matchType"
              (valueChange)="patch({ matchType: $event }, 'matchType')"
            />
            <p class="text-caption text-ink-3" data-testid="rules.form.matchHelp">
              {{ 'rules.form.matchHelp.' + draft().matchType | transloco }}
            </p>
            @if (errors().matchType; as message) {
              <p class="flex items-center gap-1.5 text-label text-status-critical">
                <app-icon name="circle-alert" [size]="16" />{{ message }}
              </p>
            }
          </div>

          <app-text-field
            data-testid="rules.form.pattern"
            autocomplete="off"
            [label]="'rules.form.pattern' | transloco"
            [value]="draft().pattern"
            [error]="errors().pattern ?? ''"
            (valueChange)="patch({ pattern: $event }, 'pattern')"
          />
        }

        <div class="flex flex-col gap-2">
          <span class="text-label text-ink-2">{{ 'rules.form.target' | transloco }}</span>
          <app-segmented-control
            data-testid="rules.form.target"
            [label]="'rules.form.target' | transloco"
            [options]="targets()"
            [value]="draft().target"
            (valueChange)="patch({ target: $event }, 'target')"
          />
          @if (draft().target === 'category') {
            <button
              appChip
              trailing="chevron-down"
              class="self-start"
              data-testid="rules.form.category"
              [icon]="categoryGlyph()"
              (click)="chooseCategory()"
            >
              {{ categoryLabel() }}
            </button>
          } @else {
            <button
              appChip
              trailing="chevron-down"
              icon="wallet"
              class="self-start"
              data-testid="rules.form.account"
              (click)="chooseAccount()"
            >
              {{ accountLabel() }}
            </button>
          }
          @if (errors().target; as message) {
            <p
              class="flex items-center gap-1.5 text-label text-status-critical"
              data-testid="rules.form.targetError"
            >
              <app-icon name="circle-alert" [size]="16" />{{ message }}
            </p>
          }
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-label text-ink-2">{{ 'rules.form.paidBy' | transloco }}</span>
          <button
            appChip
            trailing="chevron-down"
            class="self-start"
            data-testid="rules.form.paidBy"
            [person]="payer().person"
            [icon]="payer().person ? null : 'users'"
            (click)="choosePayer()"
          >
            {{ payer().label }}
          </button>
          @if (errors().paidBy; as message) {
            <p class="flex items-center gap-1.5 text-label text-status-critical">
              <app-icon name="circle-alert" [size]="16" />{{ message }}
            </p>
          } @else {
            <p class="text-caption text-ink-3">{{ 'rules.form.paidByHint' | transloco }}</p>
          }
        </div>

        <app-text-field
          data-testid="rules.form.payee"
          autocomplete="off"
          [label]="'rules.form.payee' | transloco"
          [hint]="'rules.form.payeeHint' | transloco"
          [value]="draft().payeeOverride"
          [error]="errors().payee ?? ''"
          (valueChange)="patch({ payeeOverride: $event }, 'payee')"
        />

        <button
          type="button"
          data-testid="rules.form.more"
          class="flex h-12 items-center gap-3 rounded-md border border-line bg-surface-1 pr-3 pl-4 text-left active:bg-surface-2"
          [attr.aria-expanded]="moreOpen()"
          (click)="moreOpen.set(!moreOpen())"
        >
          <span class="min-w-0 flex-1 truncate text-body text-ink-1">{{
            'rules.form.more' | transloco
          }}</span>
          <span class="truncate text-body text-ink-2 tnum">{{
            'rules.form.priorityValue' | transloco: { priority: priorityText() }
          }}</span>
          <app-icon
            name="chevron-down"
            class="shrink-0 text-ink-2 transition-transform"
            [class.rotate-180]="moreOpen()"
          />
        </button>

        @if (moreOpen()) {
          <div class="flex flex-col gap-2">
            <span [id]="priorityLabelId" class="text-label text-ink-2">{{
              'rules.form.priority' | transloco
            }}</span>
            <div
              class="flex items-center gap-2"
              role="group"
              [attr.aria-labelledby]="priorityLabelId"
            >
              <button
                appIconButton
                type="button"
                icon="arrow-down"
                data-testid="rules.form.priorityDown"
                [label]="'rules.form.lowerPriority' | transloco"
                (click)="step(-1)"
              ></button>
              <output
                class="min-w-12 text-center text-amount tnum text-ink-1"
                data-testid="rules.form.priority"
                aria-live="polite"
                >{{ priorityText() }}</output
              >
              <button
                appIconButton
                type="button"
                icon="arrow-up"
                data-testid="rules.form.priorityUp"
                [label]="'rules.form.raisePriority' | transloco"
                (click)="step(1)"
              ></button>
            </div>
            @if (errors().priority; as message) {
              <p class="flex items-center gap-1.5 text-label text-status-critical">
                <app-icon name="circle-alert" [size]="16" />{{ message }}
              </p>
            } @else {
              <p class="text-caption text-ink-3">{{ 'rules.form.priorityHint' | transloco }}</p>
            }
          </div>
        }
      </div>

      <div sheetFooter>
        <button
          appButton
          type="button"
          size="block"
          data-testid="rules.form.save"
          [disabled]="!canSave()"
          [loading]="saving()"
          (click)="save()"
        >
          {{ 'rules.form.save' | transloco }}
        </button>
      </div>
    </app-bottom-sheet>
  `,
})
export class RuleSheetComponent {
  private readonly data = inject<RuleSheetData>(DIALOG_DATA)
  private readonly dialogRef = inject<DialogRef<MerchantRule>>(DialogRef)
  private readonly store = inject(RulesStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly directory = this.store.directory

  private readonly rule = this.data.rule
  protected readonly locked = isPatternLocked(this.rule)
  protected readonly priorityLabelId = 'rule-sheet-priority'

  protected readonly draft = signal<RuleDraft>(
    this.rule ? draftFromRule(this.rule) : EMPTY_RULE_DRAFT
  )
  /** Save was pressed once: local problems show from then on. */
  private readonly attempted = signal(false)
  /** The API's field errors; a field's own is dropped as soon as it changes. */
  private readonly serverErrors = signal<RuleErrors>({})
  protected readonly saving = signal(false)
  protected readonly moreOpen = signal(false)

  private readonly words = translateSignal(WORD_KEYS)

  protected readonly title = computed(() => {
    this.words()
    return this.transloco.translate(this.rule ? TITLE_KEYS.edit : TITLE_KEYS.new)
  })

  protected readonly matchTypes = computed<SegmentOption<RuleMatchType>[]>(() => {
    const words = this.words()
    return MATCH_TYPES.map((value, index) => ({ value, label: words[index] ?? value }))
  })

  protected readonly targets = computed<SegmentOption<RuleTarget>[]>(() => {
    const words = this.words()
    return [
      { value: 'category', label: words[3] ?? '' },
      { value: 'transfer', label: words[4] ?? '' },
    ]
  })

  private readonly category = computed(() => this.directory.category(this.draft().categoryId))
  protected readonly categoryLabel = computed(
    () => this.category()?.category.name ?? this.words()[5] ?? ''
  )
  protected readonly categoryGlyph = computed<IconName>(() => {
    const entry = this.category()
    return entry ? categoryIcon(entry.category) : 'tag'
  })

  protected readonly accountLabel = computed(
    () => this.directory.account(this.draft().transferAccountId)?.name ?? this.words()[6] ?? ''
  )

  private readonly payers = computed<SelectOption<number | null>[]>(() => {
    const words = this.words()
    const youId = this.directory.youId()
    const partner = this.directory.partner()
    return [
      { value: null, label: words[7] ?? '', icon: 'users' as const },
      ...(youId === null
        ? []
        : [{ value: youId, label: words[8] ?? '', person: this.directory.personOf(youId) }]),
      ...(partner ? [{ value: partner.userId, label: partner.name, person: partner.person }] : []),
    ]
  })
  protected readonly payer = computed<{ label: string; person: Person | null }>(() => {
    const option =
      this.payers().find((item) => item.value === this.draft().paidByUserId) ?? this.payers()[0]
    return { label: option?.label ?? '', person: option?.person ?? null }
  })

  protected readonly priorityText = computed(() => formatPriority(this.draft().priority))

  /** Field errors on screen: the API's first, then (after a Save) what the form can see. */
  protected readonly errors = computed<RuleErrors>(() => {
    const local: RuleErrors = {}
    if (this.attempted()) {
      for (const [field, problem] of Object.entries(ruleProblems(this.draft()))) {
        const message = PROBLEM_MESSAGES[`${field}.${problem}`]
        if (message) {
          local[field as RuleField] = this.transloco.translate(message.key, message.params)
        }
      }
    }
    return { ...local, ...this.serverErrors() }
  })

  /** A new rule can always try (Save names what is missing); an edit needs a change. */
  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      (this.rule === null || Object.keys(rulePatch(this.rule, this.draft())).length > 0)
  )

  protected patch(changes: Partial<RuleDraft>, field: RuleField): void {
    this.draft.update((draft) => ({ ...draft, ...changes }))
    this.serverErrors.update((errors) => {
      const rest = { ...errors }
      delete rest[field]
      return rest
    })
  }

  protected step(direction: 1 | -1): void {
    this.patch({ priority: stepPriority(this.draft().priority, direction) }, 'priority')
  }

  protected chooseCategory(): void {
    const selected = this.draft().categoryId
    const entries = [
      ...this.directory.categoriesOf('expense'),
      ...this.directory.categoriesOf('income'),
    ]
    const current = this.category()
    if (current && !entries.some((entry) => entry.category.id === selected)) {
      entries.unshift(current)
    }
    openSelectSheet(this.sheets, {
      title: this.transloco.translate(TITLE_KEYS.category),
      options: entries.map((entry) => ({
        value: entry.category.id,
        label: entry.category.name,
        meta: entry.group.name,
        icon: categoryIcon(entry.category),
      })),
      selected,
    }).subscribe((categoryId) => {
      if (categoryId !== undefined) {
        this.patch({ categoryId }, 'target')
      }
    })
  }

  protected chooseAccount(): void {
    const selected = this.draft().transferAccountId
    const accounts = this.directory
      .accounts()
      .filter((account) => account.isActive || account.id === selected)
    openSelectSheet(this.sheets, {
      title: this.transloco.translate(TITLE_KEYS.account),
      options: accounts.map((account) => ({
        value: account.id,
        label: account.name,
        icon: 'wallet' as const,
      })),
      selected,
    }).subscribe((transferAccountId) => {
      if (transferAccountId !== undefined) {
        this.patch({ transferAccountId }, 'target')
      }
    })
  }

  protected choosePayer(): void {
    openSelectSheet(this.sheets, {
      title: this.transloco.translate(TITLE_KEYS.payer),
      options: this.payers(),
      selected: this.draft().paidByUserId,
    }).subscribe((paidByUserId) => {
      if (paidByUserId !== undefined) {
        this.patch({ paidByUserId }, 'paidBy')
      }
    })
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return
    }
    this.attempted.set(true)
    if (Object.keys(ruleProblems(this.draft())).length > 0) {
      return
    }
    this.saving.set(true)
    this.serverErrors.set({})
    try {
      this.dialogRef.close(await this.store.save(this.rule, this.draft()))
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        this.serverErrors.set(ruleErrorsFrom(failure.fields))
      } else if (failure.kind !== 'unauthorized') {
        const message = failureMessage(failure)
        this.serverErrors.set({ form: this.transloco.translate(message.key, message.params) })
      }
    } finally {
      this.saving.set(false)
    }
  }
}
