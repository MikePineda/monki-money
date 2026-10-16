import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import {
  compareYearMonth,
  label as monthLabel,
  yearOf,
  type YearMonth,
} from '../../../domain/month'
import { APP_LOCALE } from '../app-locale.token'
import { BottomSheetComponent } from '../bottom-sheet/bottom-sheet.component'

export interface YearGridData {
  selected: YearMonth
  /** The current month in the household time zone; later months are future. */
  current: YearMonth
  /** Years offered, the current one first. */
  years: number
}

interface GridMonth {
  value: YearMonth
  label: string
  future: boolean
  selected: boolean
}

/**
 * The year grid behind the month strip (DESIGN.md, Month picker): one block
 * of twelve months per year, the current year first, the selected month
 * with the accent wash and future months disabled. Closes with the chosen
 * month; dismissing closes with undefined.
 */
@Component({
  selector: 'app-year-grid-sheet',
  imports: [BottomSheetComponent, TranslocoPipe],
  template: `
    <app-bottom-sheet
      data-testid="monthPicker.yearGrid"
      [title]="'ui.yearGrid.title' | transloco"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <div class="flex flex-col gap-4 px-4 pb-2">
        @for (block of years; track block.year) {
          <section class="flex flex-col gap-2">
            <h3 class="text-label text-ink-2">{{ block.year }}</h3>
            <div class="grid grid-cols-4 gap-2">
              @for (month of block.months; track month.value) {
                <button
                  type="button"
                  class="h-11 rounded-md text-label"
                  [class]="classesFor(month)"
                  [attr.data-month]="month.value"
                  [attr.aria-current]="month.selected ? 'date' : null"
                  [disabled]="month.future"
                  (click)="pick(month.value)"
                >
                  {{ month.label }}
                </button>
              }
            </div>
          </section>
        }
      </div>
    </app-bottom-sheet>
  `,
})
export class YearGridSheetComponent {
  private readonly dialogRef = inject<DialogRef<YearMonth, YearGridSheetComponent>>(DialogRef)
  private readonly data = inject<YearGridData>(DIALOG_DATA)
  private readonly locale = inject(APP_LOCALE)

  protected readonly years = Array.from({ length: this.data.years }, (_, index) => {
    const year = yearOf(this.data.current) - index
    return {
      year,
      months: Array.from({ length: 12 }, (_, month): GridMonth => {
        const value = `${year}-${String(month + 1).padStart(2, '0')}` as YearMonth
        return {
          value,
          label: monthLabel(value, this.locale()),
          future: compareYearMonth(value, this.data.current) > 0,
          selected: value === this.data.selected,
        }
      }),
    }
  })

  protected classesFor(month: GridMonth): string {
    if (month.selected) {
      return 'bg-accent-soft font-semibold text-accent'
    }
    return month.future ? 'text-ink-3' : 'text-ink-2 active:bg-surface-2'
  }

  protected pick(month: YearMonth): void {
    this.dialogRef.close(month)
  }
}
