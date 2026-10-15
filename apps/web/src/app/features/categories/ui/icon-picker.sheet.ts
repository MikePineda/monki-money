import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { CATEGORY_ICON_CHOICES } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'

export interface IconPickerData {
  title: string
  selected: IconName
}

/**
 * A grid of the category glyphs (one icon set: Lucide from the app's
 * sprite). Closes with the chosen icon name; the current one carries the
 * selection wash.
 */
@Component({
  selector: 'app-icon-picker-sheet',
  imports: [BottomSheetComponent, IconComponent, TranslocoPipe],
  template: `
    <app-bottom-sheet [title]="data.title" [closeLabel]="'ui.sheet.close' | transloco">
      <ul
        class="grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2 px-4 pb-4"
        role="listbox"
        [attr.aria-label]="data.title"
      >
        @for (icon of icons; track icon) {
          <li
            role="option"
            tabindex="0"
            class="grid h-12 place-items-center rounded-md border text-ink-1 active:bg-surface-2"
            [class]="
              icon === data.selected ? 'border-accent bg-accent-soft text-accent' : 'border-line'
            "
            [attr.aria-selected]="icon === data.selected"
            [attr.aria-label]="'categories.icons.option' | transloco: { name: spoken(icon) }"
            [attr.data-icon-option]="icon"
            (click)="choose(icon)"
            (keydown.enter)="choose(icon)"
            (keydown.space)="$event.preventDefault(); choose(icon)"
          >
            <app-icon [name]="icon" />
          </li>
        }
      </ul>
    </app-bottom-sheet>
  `,
})
export class IconPickerSheetComponent {
  protected readonly data = inject<IconPickerData>(DIALOG_DATA)
  private readonly dialogRef = inject<DialogRef<IconName>>(DialogRef)

  protected readonly icons = CATEGORY_ICON_CHOICES

  /** The glyph's name as words ("shopping cart"), for screen readers. */
  protected spoken(icon: IconName): string {
    return icon.replace(/-\d+$/, '').replace(/-/g, ' ')
  }

  protected choose(icon: IconName): void {
    this.dialogRef.close(icon)
  }
}
