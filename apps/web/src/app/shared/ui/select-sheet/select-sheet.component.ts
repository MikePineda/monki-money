import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import type { Observable } from 'rxjs'
import { matchesSearch } from '../../../domain/text'
import { IconComponent } from '../../icons/icon.component'
import type { IconName } from '../../icons/icon-names'
import { BottomSheetComponent } from '../bottom-sheet/bottom-sheet.component'
import type { BottomSheetService } from '../bottom-sheet/bottom-sheet.service'
import { PersonDotComponent, type Person } from '../person-dot/person-dot.component'
import { TextFieldComponent } from '../text-field/text-field.component'

export interface SelectOption<T> {
  value: T
  label: string
  /** Secondary line, for example the account owner. */
  meta?: string
  icon?: IconName
  person?: Person
}

export interface SelectSheetData<T> {
  title: string
  options: readonly SelectOption<T>[]
  selected?: T | null
}

/** A search field appears when there are more options than this (DESIGN.md). */
export const SELECT_SEARCH_THRESHOLD = 8

/**
 * A list of 56px options in a bottom sheet (DESIGN.md, Select sheet), with a
 * trailing accent check on the selected one and a search field for long
 * lists. Closes with the chosen value; dismissing closes with undefined.
 */
@Component({
  selector: 'app-select-sheet',
  imports: [
    BottomSheetComponent,
    IconComponent,
    PersonDotComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet [title]="data.title" [closeLabel]="'ui.sheet.close' | transloco">
      @if (searchable) {
        <app-text-field
          class="px-4 pb-2"
          type="search"
          autocomplete="off"
          [label]="'ui.select.search' | transloco"
          [(value)]="query"
        />
      }
      <ul class="flex flex-col" role="listbox" [attr.aria-label]="data.title">
        @for (option of visible(); track $index) {
          <li
            role="option"
            tabindex="0"
            class="relative flex h-14 items-center gap-3 px-4 text-ink-1 outline-offset-[-2px] active:bg-surface-2"
            [attr.aria-selected]="isSelected(option)"
            (click)="choose(option)"
            (keydown.enter)="choose(option)"
            (keydown.space)="$event.preventDefault(); choose(option)"
          >
            @if (option.icon) {
              <app-icon [name]="option.icon" />
            } @else if (option.person) {
              <app-person-dot [person]="option.person" />
            }
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-body">{{ option.label }}</span>
              @if (option.meta) {
                <span class="truncate text-caption text-ink-3">{{ option.meta }}</span>
              }
            </span>
            @if (isSelected(option)) {
              <app-icon name="check" class="text-accent" />
            }
          </li>
        } @empty {
          <li class="px-4 py-6 text-center text-body text-ink-2">
            {{ 'ui.select.noResults' | transloco }}
          </li>
        }
      </ul>
    </app-bottom-sheet>
  `,
})
export class SelectSheetComponent<T> {
  private readonly dialogRef = inject<DialogRef<T, SelectSheetComponent<T>>>(DialogRef)
  protected readonly data = inject<SelectSheetData<T>>(DIALOG_DATA)

  protected readonly searchable = this.data.options.length > SELECT_SEARCH_THRESHOLD
  protected readonly query = signal('')
  protected readonly visible = computed(() =>
    this.data.options.filter((option) =>
      matchesSearch(`${option.label} ${option.meta ?? ''}`, this.query())
    )
  )

  protected isSelected(option: SelectOption<T>): boolean {
    return this.data.selected !== undefined && Object.is(option.value, this.data.selected)
  }

  protected choose(option: SelectOption<T>): void {
    this.dialogRef.close(option.value)
  }
}

/** Opens a select sheet and emits the chosen value, or undefined when dismissed. */
export function openSelectSheet<T>(
  sheets: BottomSheetService,
  data: SelectSheetData<T>
): Observable<T | undefined> {
  return sheets.open<T, SelectSheetData<T>, SelectSheetComponent<T>>(SelectSheetComponent, {
    data,
  }).closed
}
