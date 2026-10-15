import { CdkDragHandle } from '@angular/cdk/drag-drop'
import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import type { TreeCategory } from '../../../domain/category-tree'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'

/**
 * One category (mock `categories`): a drag handle, the icon square (tap to
 * pick another icon), the name (tap to rename inline), and a trailing
 * archive button. In reorder mode the archive button gives way to ▲▼, the
 * accessible alternative to dragging.
 */
@Component({
  selector: 'app-category-row',
  imports: [CdkDragHandle, IconButtonComponent, IconComponent, TranslocoPipe],
  template: `
    <span
      cdkDragHandle
      class="grid h-14 w-8 shrink-0 cursor-grab touch-none place-items-center text-ink-3"
      aria-hidden="true"
    >
      <app-icon name="grip-vertical" />
    </span>
    <button
      type="button"
      class="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-1 active:bg-line"
      data-testid="categories.icon"
      [attr.aria-label]="'categories.row.icon' | transloco: { name: category().name }"
      (click)="iconPressed.emit()"
    >
      <app-icon [name]="glyph()" />
    </button>
    @if (editing()) {
      <input
        #nameInput
        type="text"
        class="h-11 min-w-0 flex-1 rounded-md border-2 border-accent bg-surface-1 px-3 text-body text-ink-1 focus-visible:outline-none"
        maxlength="80"
        autocomplete="off"
        data-testid="categories.renameInput"
        [attr.aria-label]="'categories.row.rename' | transloco: { name: category().name }"
        [value]="category().name"
        (keydown.enter)="commit($event)"
        (keydown.escape)="cancel()"
        (blur)="commit($event)"
      />
    } @else {
      <button
        type="button"
        class="flex h-14 min-w-0 flex-1 items-center text-left text-body text-ink-1"
        data-testid="categories.name"
        [attr.aria-label]="'categories.row.rename' | transloco: { name: category().name }"
        (click)="renameRequested.emit()"
      >
        <span class="truncate">{{ category().name }}</span>
      </button>
    }
    @if (reorderMode()) {
      <button
        appIconButton
        type="button"
        icon="arrow-up"
        data-testid="categories.up"
        [label]="'categories.row.up' | transloco: { name: category().name }"
        [disabled]="!canMoveUp()"
        (click)="moved.emit(-1)"
      ></button>
      <button
        appIconButton
        type="button"
        icon="arrow-down"
        data-testid="categories.down"
        [label]="'categories.row.down' | transloco: { name: category().name }"
        [disabled]="!canMoveDown()"
        (click)="moved.emit(1)"
      ></button>
    } @else {
      <button
        appIconButton
        type="button"
        icon="archive"
        data-testid="categories.archive"
        [label]="'categories.row.archive' | transloco: { name: category().name }"
        (click)="archived.emit()"
      ></button>
    }
  `,
  host: {
    'role': 'listitem',
    'class': 'flex h-14 items-center gap-3 border-b border-line bg-surface-0 pr-1',
    'data-testid': 'categories.row',
    '[attr.data-id]': 'category().id',
  },
})
export class CategoryRowComponent {
  readonly category = input.required<TreeCategory>()
  readonly editing = input(false)
  readonly reorderMode = input(false)
  readonly canMoveUp = input(true)
  readonly canMoveDown = input(true)

  readonly iconPressed = output<void>()
  readonly renameRequested = output<void>()
  readonly renamed = output<string>()
  readonly cancelled = output<void>()
  readonly archived = output<void>()
  readonly moved = output<-1 | 1>()

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput')
  protected readonly glyph = computed(() => categoryIcon(this.category()))
  private committed = false

  constructor() {
    afterRenderEffect(() => {
      const input = this.nameInput()?.nativeElement
      if (input && this.editing()) {
        this.committed = false
        input.focus()
        input.select()
      }
    })
  }

  protected cancel(): void {
    this.committed = true
    this.cancelled.emit()
  }

  protected commit(event: Event): void {
    // Enter commits and then blurs: only the first one counts.
    if (this.committed) {
      return
    }
    this.committed = true
    event.preventDefault()
    this.renamed.emit((event.target as HTMLInputElement).value)
  }
}
