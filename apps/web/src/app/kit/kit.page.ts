import { Component, Injector, computed, inject, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import {
  TranslocoPipe,
  TranslocoService,
  provideTranslocoScope,
  translateSignal,
} from '@jsverse/transloco'
import { marker } from '@jsverse/transloco-keys-manager/marker'
import { LangStore } from '../core/i18n/lang.store'
import { HOUSEHOLD_TIME_ZONE } from '../core/platform/time-zone.token'
import { ThemeStore, type ThemePreference } from '../core/theme/theme.store'
import { ToastStore } from '../core/ui/toast.store'
import type { AppLang } from '../domain/locale'
import { currentMonthIn } from '../domain/month'
import type { TransactionKind } from '../domain/money'
import { ToastOutletComponent } from '../layouts/toast-outlet/toast-outlet.component'
import { AmountDisplayComponent } from '../shared/ui/amount-display/amount-display.component'
import { AmountKeypadComponent } from '../shared/ui/amount-keypad/amount-keypad.component'
import { BannerComponent } from '../shared/ui/banner/banner.component'
import { BottomSheetService } from '../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../shared/ui/button/button.component'
import { CardComponent } from '../shared/ui/card/card.component'
import { CheckboxComponent } from '../shared/ui/checkbox/checkbox.component'
import { ChipComponent } from '../shared/ui/chip/chip.component'
import { EmptyStateComponent } from '../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../shared/ui/icon-button/icon-button.component'
import { ListRowComponent } from '../shared/ui/list-row/list-row.component'
import { MonthPickerComponent } from '../shared/ui/month-picker/month-picker.component'
import { ProgressTrackComponent } from '../shared/ui/progress-track/progress-track.component'
import { SectionHeaderComponent } from '../shared/ui/section-header/section-header.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../shared/ui/segmented-control/segmented-control.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../shared/ui/skeleton/skeleton.component'
import { StatTileComponent } from '../shared/ui/stat-tile/stat-tile.component'
import { TabBarComponent, type TabItem } from '../shared/ui/tab-bar/tab-bar.component'
import { TextFieldComponent } from '../shared/ui/text-field/text-field.component'
import { ToastComponent } from '../shared/ui/toast/toast.component'
import { KitDemoSheetComponent } from './kit-demo-sheet.component'

interface Swatch {
  token: string
  className: string
}

/** Swatches use literal utility classes so Tailwind generates them. */
const SWATCHES: readonly { group: string; swatches: readonly Swatch[] }[] = [
  {
    group: 'surface',
    swatches: [
      { token: '--surface-0', className: 'bg-surface-0' },
      { token: '--surface-1', className: 'bg-surface-1' },
      { token: '--surface-2', className: 'bg-surface-2' },
      { token: '--ink-1', className: 'bg-ink-1' },
      { token: '--ink-2', className: 'bg-ink-2' },
      { token: '--ink-3', className: 'bg-ink-3' },
      { token: '--line', className: 'bg-line' },
      { token: '--line-strong', className: 'bg-line-strong' },
    ],
  },
  {
    group: 'semantic',
    swatches: [
      { token: '--accent', className: 'bg-accent' },
      { token: '--accent-soft', className: 'bg-accent-soft' },
      { token: '--income', className: 'bg-income' },
      { token: '--expense', className: 'bg-expense' },
      { token: '--transfer', className: 'bg-transfer' },
      { token: '--person-a', className: 'bg-person-a' },
      { token: '--person-b', className: 'bg-person-b' },
      { token: '--mark-neutral', className: 'bg-mark-neutral' },
      { token: '--mark-muted', className: 'bg-mark-muted' },
    ],
  },
  {
    group: 'series',
    swatches: [
      { token: '--series-1', className: 'bg-series-1' },
      { token: '--series-2', className: 'bg-series-2' },
      { token: '--series-3', className: 'bg-series-3' },
      { token: '--series-4', className: 'bg-series-4' },
      { token: '--series-5', className: 'bg-series-5' },
      { token: '--series-6', className: 'bg-series-6' },
      { token: '--series-7', className: 'bg-series-7' },
      { token: '--series-8', className: 'bg-series-8' },
    ],
  },
  {
    group: 'status',
    swatches: [
      { token: '--status-good', className: 'bg-status-good' },
      { token: '--status-warning', className: 'bg-status-warning' },
      { token: '--status-serious', className: 'bg-status-serious' },
      { token: '--status-critical', className: 'bg-status-critical' },
      { token: '--gridline', className: 'bg-gridline' },
      { token: '--baseline', className: 'bg-baseline' },
    ],
  },
]

/*
 * Scoped keys used from TypeScript are plain strings (Transloco resolves the
 * "kit." prefix at runtime) and are declared for transloco-keys-manager in
 * the marker comment below, which resolves the scope from that prefix.
 */
/**
 * t(kit.theme.light, kit.theme.dark, kit.theme.system, kit.lang.en, kit.lang.es)
 * t(kit.kind.expense, kit.kind.income, kit.kind.transfer)
 * t(kit.tabs.month, kit.tabs.transactions, kit.tabs.more)
 * t(kit.data.groceries, kit.data.rent, kit.data.utilities, kit.data.eatingOut, kit.data.transport)
 * t(kit.data.health, kit.data.phone, kit.data.coffee, kit.data.other, kit.data.shared, kit.data.you)
 * t(kit.sheet.accountTitle, kit.sheet.categoryTitle, kit.toast.saved, kit.toast.undo)
 */
// translateSignal() prefixes the component's scope alias ("kit."), so the
// keys it receives are relative to the scope.
const THEME_KEYS = ['theme.light', 'theme.dark', 'theme.system']
const LANG_KEYS = ['lang.en', 'lang.es']
const KIND_KEYS = ['kind.expense', 'kind.income', 'kind.transfer']
const TAB_KEYS = ['tabs.month', 'tabs.transactions', 'tabs.more']
const CATEGORY_KEYS = [
  'kit.data.groceries',
  'kit.data.rent',
  'kit.data.utilities',
  'kit.data.eatingOut',
  'kit.data.transport',
  'kit.data.health',
  'kit.data.phone',
  'kit.data.coffee',
  'kit.data.other',
]
/** Demo account names (data, not copy). */
const ACCOUNT_LABELS: Record<string, string> = {
  everyday: 'NAB Everyday',
  savings: 'NAB Savings',
  hnry: 'Hnry',
}

const KIT_KEYS = {
  shared: 'kit.data.shared',
  you: 'kit.data.you',
  accountTitle: 'kit.sheet.accountTitle',
  categoryTitle: 'kit.sheet.categoryTitle',
  saved: 'kit.toast.saved',
  undo: 'kit.toast.undo',
}

/**
 * The ui-kit gallery (`/__kit`, development builds only): every component
 * in every state, with live theme and language switches, used for visual QA
 * against DESIGN.md in both themes.
 */
@Component({
  selector: 'app-kit-page',
  imports: [
    AmountDisplayComponent,
    AmountKeypadComponent,
    BannerComponent,
    ButtonComponent,
    CardComponent,
    CheckboxComponent,
    ChipComponent,
    EmptyStateComponent,
    IconButtonComponent,
    ListRowComponent,
    MonthPickerComponent,
    ProgressTrackComponent,
    RouterLink,
    SectionHeaderComponent,
    SegmentedControlComponent,
    SkeletonComponent,
    StatTileComponent,
    TabBarComponent,
    TextFieldComponent,
    ToastComponent,
    ToastOutletComponent,
    TranslocoPipe,
  ],
  providers: [
    provideTranslocoScope({
      scope: 'kit',
      loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
    }),
  ],
  templateUrl: './kit.page.html',
})
export default class KitPage {
  protected readonly theme = inject(ThemeStore)
  protected readonly lang = inject(LangStore)
  private readonly toasts = inject(ToastStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly injector = inject(Injector)

  protected readonly swatches = SWATCHES

  private readonly themeLabels = translateSignal(THEME_KEYS)
  protected readonly themeOptions = computed<SegmentOption<ThemePreference>[]>(() => {
    const [light = '', dark = '', system = ''] = this.themeLabels()
    return [
      { value: 'light', label: light },
      { value: 'dark', label: dark },
      { value: 'system', label: system },
    ]
  })

  private readonly langLabels = translateSignal(LANG_KEYS)
  protected readonly langOptions = computed<SegmentOption<AppLang>[]>(() => {
    const [en = '', es = ''] = this.langLabels()
    return [
      { value: 'en', label: en },
      { value: 'es', label: es },
    ]
  })

  private readonly kindLabels = translateSignal(KIND_KEYS)
  protected readonly kindOptions = computed<SegmentOption<TransactionKind>[]>(() => {
    const [expense = '', income = '', transfer = ''] = this.kindLabels()
    return [
      { value: 'expense', label: expense },
      { value: 'income', label: income },
      { value: 'transfer', label: transfer },
    ]
  })

  private readonly tabLabels = translateSignal(TAB_KEYS)
  protected readonly tabs = computed<TabItem[]>(() => {
    const [month = '', transactions = '', more = ''] = this.tabLabels()
    return [
      { path: '/__kit', icon: 'calendar', label: month },
      { path: '/__kit/transactions', icon: 'list', label: transactions },
      { path: '/__kit/more', icon: 'ellipsis', label: more },
    ]
  })

  protected readonly kind = signal<TransactionKind>('expense')
  protected readonly amountCents = signal(4250)
  protected readonly note = signal('')
  protected readonly agreed = signal(false)
  protected readonly loading = signal(false)
  protected readonly tablePressed = signal(false)
  protected readonly groceriesSelected = signal(true)
  protected readonly rentSelected = signal(false)
  protected readonly account = signal('everyday')
  protected readonly category = signal(CATEGORY_KEYS[0] ?? '')
  protected readonly currentMonth = currentMonthIn(inject(HOUSEHOLD_TIME_ZONE)())
  protected readonly month = signal(this.currentMonth)
  protected readonly bannerVisible = signal(true)

  protected readonly accountLabel = computed(() => ACCOUNT_LABELS[this.account()] ?? '')

  protected toggleLoading(): void {
    this.loading.set(true)
    setTimeout(() => this.loading.set(false), 1500)
  }

  protected showToast(): void {
    this.toasts.show({
      messageKey: KIT_KEYS.saved,
      status: 'good',
      action: { labelKey: KIT_KEYS.undo, run: () => this.amountCents.set(0) },
    })
  }

  protected showPersistentToast(): void {
    this.toasts.show({
      messageKey: marker('pwa.update.ready'),
      persistent: true,
      action: { labelKey: marker('pwa.update.action'), run: () => undefined },
    })
  }

  protected openAccountSheet(): void {
    openSelectSheet(this.sheets, {
      title: this.transloco.translate(KIT_KEYS.accountTitle),
      options: this.accountOptions(),
      selected: this.account(),
    }).subscribe((value) => {
      if (value !== undefined) {
        this.account.set(value)
      }
    })
  }

  /** Built when the sheet opens, so the scope catalogue is loaded by then. */
  private accountOptions(): SelectOption<string>[] {
    const shared = this.transloco.translate(KIT_KEYS.shared)
    return [
      { value: 'everyday', label: ACCOUNT_LABELS['everyday'] ?? '', meta: shared, person: 'joint' },
      { value: 'savings', label: ACCOUNT_LABELS['savings'] ?? '', meta: shared, person: 'joint' },
      {
        value: 'hnry',
        label: ACCOUNT_LABELS['hnry'] ?? '',
        meta: this.transloco.translate(KIT_KEYS.you),
        person: 'a',
      },
    ]
  }

  protected openCategorySheet(): void {
    const options: SelectOption<string>[] = CATEGORY_KEYS.map((key) => ({
      value: key,
      label: this.transloco.translate(key),
    }))
    openSelectSheet(this.sheets, {
      title: this.transloco.translate(KIT_KEYS.categoryTitle),
      options,
      selected: this.category(),
    }).subscribe((value) => {
      if (value !== undefined) {
        this.category.set(value)
      }
    })
  }

  protected openDemoSheet(): void {
    this.sheets.open(KitDemoSheetComponent, { injector: this.injector })
  }
}
