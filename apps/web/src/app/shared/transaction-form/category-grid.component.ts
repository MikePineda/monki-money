import { Component, input, output } from '@angular/core'
import { IconComponent } from '../icons/icon.component'
import type { IconName } from '../icons/icon-names'

export interface CategoryTile {
  id: number
  name: string
  icon: IconName
}

/**
 * The quick-add category grid (DESIGN.md, Category tile): 4 × 2 tiles of
 * 64px, the seven most used categories and an eighth "More" tile that opens
 * the full list. The selected tile wears the accent wash; tapping it again
 * clears the category (saving without one is allowed).
 */
@Component({
  selector: 'app-category-grid',
  imports: [IconComponent],
  template: `
    <div role="group" class="grid grid-cols-4 gap-2" [attr.aria-label]="label()">
      @for (tile of tiles(); track tile.id) {
        <button
          type="button"
          class="flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1 transition-colors"
          [class]="
            tile.id === selected()
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line bg-surface-1 text-ink-1 active:bg-surface-2'
          "
          [attr.aria-pressed]="tile.id === selected()"
          [attr.data-category]="tile.id"
          (click)="picked.emit(tile.id)"
        >
          <app-icon [name]="tile.icon" />
          <span
            class="w-full truncate text-center text-caption"
            [class.text-ink-2]="tile.id !== selected()"
            >{{ tile.name }}</span
          >
        </button>
      }
      <button
        type="button"
        data-category="more"
        class="flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface-1 px-1 text-ink-1 active:bg-surface-2"
        aria-haspopup="dialog"
        (click)="more.emit()"
      >
        <app-icon name="ellipsis" />
        <span class="w-full truncate text-center text-caption text-ink-2">{{ moreLabel() }}</span>
      </button>
    </div>
  `,
  host: { class: 'block' },
})
export class CategoryGridComponent {
  readonly tiles = input.required<readonly CategoryTile[]>()
  readonly selected = input<number | null>(null)
  /** Accessible name of the group ("Category"). */
  readonly label = input.required<string>()
  readonly moreLabel = input.required<string>()
  readonly picked = output<number>()
  readonly more = output<void>()
}
