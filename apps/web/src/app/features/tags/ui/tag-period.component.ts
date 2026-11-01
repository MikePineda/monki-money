import { Component, computed, inject, input, output } from '@angular/core'
import { TranslocoService, translateSignal } from '@jsverse/transloco'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../../../shared/ui/select-sheet/select-sheet.component'
import { TAG_PERIODS, type TagPeriod } from '../tag-period'

/**
 * Keys read from TypeScript, relative to the `tags` scope:
 * t(tags.period.all, tags.period.last12, tags.period.thisYear, tags.period.lastYear)
 * and the sheet's title, a full key: t(tags.period.title)
 */
const PERIOD_KEYS = TAG_PERIODS.map((period) => `period.${period}`)
const TITLE_KEY = 'tags.period.title'

/**
 * The date range of the tags screens: a chip with the period on screen
 * ("All time"), selected once it narrows the dates, that opens a sheet of
 * the periods (all time, the last 12 months, this year, last year). Emits
 * the period picked; the page keeps it in its URL.
 */
@Component({
  selector: 'app-tag-period',
  imports: [ChipComponent],
  template: `
    <button
      appChip
      icon="calendar"
      trailing="chevron-down"
      data-testid="tags.period"
      [selected]="period() !== 'all'"
      (click)="choose()"
    >
      {{ label() }}
    </button>
  `,
  host: { class: 'block' },
})
export class TagPeriodComponent {
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)

  readonly period = input.required<TagPeriod>()
  readonly changed = output<TagPeriod>()

  private readonly labels = translateSignal(PERIOD_KEYS)

  protected readonly label = computed(() => this.labels()[TAG_PERIODS.indexOf(this.period())] ?? '')

  protected choose(): void {
    const labels = this.labels()
    const options: SelectOption<TagPeriod>[] = TAG_PERIODS.map((period, index) => ({
      value: period,
      label: labels[index] ?? '',
      icon: 'calendar',
    }))
    openSelectSheet(this.sheets, {
      title: this.transloco.translate(TITLE_KEY),
      options,
      selected: this.period(),
    }).subscribe((period) => {
      if (period !== undefined && period !== this.period()) {
        this.changed.emit(period)
      }
    })
  }
}
