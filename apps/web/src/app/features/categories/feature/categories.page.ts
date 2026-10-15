import { CdkDrag, CdkDropList, CdkDropListGroup, type CdkDragDrop } from '@angular/cdk/drag-drop'
import {
  Component,
  ElementRef,
  OnInit,
  afterRenderEffect,
  inject,
  signal,
  viewChild,
} from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco'
import { ToastStore } from '../../../core/ui/toast.store'
import type { TreeCategory } from '../../../domain/category-tree'
import { categoryIcon } from '../../../shared/icons/category-icons'
import { IconComponent } from '../../../shared/icons/icon.component'
import type { IconName } from '../../../shared/icons/icon-names'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { openSelectSheet } from '../../../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { CategoriesPageStore } from '../categories.store'
import { CategoryRowComponent } from '../ui/category-row.component'
import { IconPickerSheetComponent, type IconPickerData } from '../ui/icon-picker.sheet'

/**
 * Keys read from TypeScript:
 * t(categories.icons.title, categories.delete.reassignTitle, categories.toast.deleted)
 */
const KEYS = {
  iconTitle: 'categories.icons.title',
  reassignTitle: 'categories.delete.reassignTitle',
}

/**
 * Categories (plan, screen 11; mock `categories`): groups and their
 * categories in display order. Reorder by dragging the handle (CDK drag and
 * drop, also across groups) or, in reorder mode, with ▲▼ buttons. Rename
 * and create inline, pick an icon, archive (hidden from pickers, history
 * kept) and restore; delete from the archive, moving its transactions to
 * another category when it has any.
 */
@Component({
  selector: 'app-categories-page',
  imports: [
    ButtonComponent,
    CategoryRowComponent,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    EmptyStateComponent,
    IconButtonComponent,
    IconComponent,
    RouterLink,
    SkeletonComponent,
    TranslocoPipe,
  ],
  providers: [
    CategoriesPageStore,
    provideTranslocoScope({
      scope: 'categories',
      loader: { en: () => import('../i18n/en.json'), es: () => import('../i18n/es.json') },
    }),
  ],
  template: `
    <header class="flex h-14 items-center gap-1 pr-1 pl-1">
      <a
        appIconButton
        icon="arrow-left"
        routerLink="/settings"
        [label]="'categories.back' | transloco"
      ></a>
      <h1 class="min-w-0 flex-1 truncate text-heading text-ink-1">
        {{ 'categories.title' | transloco }}
      </h1>
      <button
        appIconButton
        type="button"
        icon="arrow-up-down"
        data-testid="categories.reorder"
        [label]="'categories.reorder' | transloco"
        [pressed]="reorderMode()"
        (click)="reorderMode.set(!reorderMode())"
      ></button>
    </header>

    @if (reorderMode()) {
      <p class="px-4 pb-2 text-caption text-ink-3" role="status">
        {{ 'categories.reorderHint' | transloco }}
      </p>
    }

    @if (store.loading() && store.active().length === 0) {
      <div class="flex flex-col gap-2 px-4 pt-4" aria-hidden="true">
        @for (item of [1, 2, 3, 4]; track item) {
          <app-skeleton height="56px" />
        }
      </div>
    } @else if (store.failed() && store.active().length === 0) {
      <app-empty-state
        icon="wifi-off"
        [title]="'categories.error.title' | transloco"
        [body]="'categories.error.body' | transloco"
      >
        <button
          appButton
          type="button"
          variant="secondary"
          icon="refresh-cw"
          (click)="store.load()"
        >
          {{ 'categories.error.retry' | transloco }}
        </button>
      </app-empty-state>
    } @else {
      <div cdkDropListGroup class="flex flex-col pb-8" data-testid="categories.page">
        @for (
          group of store.active();
          track group.id;
          let firstGroup = $first;
          let lastGroup = $last
        ) {
          <section class="pt-6" [attr.data-testid]="'categories.group.' + group.id">
            <div class="flex h-11 items-center justify-between gap-2 pr-1 pl-4">
              <h2 class="truncate text-eyebrow text-ink-2 uppercase">{{ group.name }}</h2>
              @if (reorderMode()) {
                <div class="flex">
                  <button
                    appIconButton
                    type="button"
                    icon="arrow-up"
                    [label]="'categories.group.up' | transloco: { name: group.name }"
                    [disabled]="firstGroup"
                    (click)="store.stepGroup(group.id, -1)"
                  ></button>
                  <button
                    appIconButton
                    type="button"
                    icon="arrow-down"
                    [label]="'categories.group.down' | transloco: { name: group.name }"
                    [disabled]="lastGroup"
                    (click)="store.stepGroup(group.id, 1)"
                  ></button>
                </div>
              }
            </div>
            <div
              cdkDropList
              role="list"
              class="flex min-h-2 flex-col border-t border-line"
              [cdkDropListData]="group.id"
              [attr.aria-label]="group.name"
              (cdkDropListDropped)="dropped($event)"
            >
              @for (
                category of group.categories;
                track category.id;
                let first = $first;
                let last = $last
              ) {
                <app-category-row
                  cdkDrag
                  cdkDragPreviewClass="mm-drag-preview"
                  [cdkDragData]="category.id"
                  [category]="category"
                  [editing]="renaming() === category.id"
                  [reorderMode]="reorderMode()"
                  [canMoveUp]="!(first && firstGroup)"
                  [canMoveDown]="!(last && lastGroup)"
                  (iconPressed)="pickIcon(category)"
                  (renameRequested)="renaming.set(category.id)"
                  (renamed)="rename(category, $event)"
                  (cancelled)="renaming.set(null)"
                  (archived)="store.archive(category.id)"
                  (moved)="store.step(category.id, $event)"
                />
              }
            </div>
            @if (adding() === group.id) {
              <div class="flex h-14 items-center gap-3 border-b border-line px-4">
                <span
                  class="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-3"
                >
                  <app-icon name="tag" />
                </span>
                <input
                  #newName
                  type="text"
                  class="h-11 min-w-0 flex-1 rounded-md border-2 border-accent bg-surface-1 px-3 text-body text-ink-1 focus-visible:outline-none"
                  maxlength="80"
                  autocomplete="off"
                  data-testid="categories.newName"
                  [attr.aria-label]="'categories.add.label' | transloco: { group: group.name }"
                  (keydown.enter)="create(group.id, newName.value)"
                  (keydown.escape)="adding.set(null)"
                  (blur)="create(group.id, newName.value)"
                />
              </div>
            } @else if (!reorderMode()) {
              <button
                type="button"
                class="flex h-12 w-full items-center gap-2 px-4 text-label text-accent active:bg-surface-2"
                [attr.data-testid]="'categories.add.' + group.id"
                (click)="adding.set(group.id)"
              >
                <app-icon name="plus" [size]="16" />{{ 'categories.add.action' | transloco }}
              </button>
            }
          </section>
        }

        @if (store.archived().length > 0) {
          <section class="mt-8 border-y border-line" data-testid="categories.archived">
            <button
              type="button"
              class="flex h-14 w-full items-center justify-between px-4 text-body text-ink-2 active:bg-surface-2"
              [attr.aria-expanded]="showArchived()"
              (click)="showArchived.set(!showArchived())"
            >
              {{ 'categories.archived.title' | transloco: { count: store.archived().length } }}
              <app-icon [name]="showArchived() ? 'chevron-down' : 'chevron-right'" />
            </button>
            @if (showArchived()) {
              <ul class="flex flex-col">
                @for (item of store.archived(); track item.category.id) {
                  <li class="flex h-14 items-center gap-3 border-t border-line pr-1 pl-4">
                    <span
                      class="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-3"
                    >
                      <app-icon [name]="glyph(item.category)" />
                    </span>
                    <span class="flex min-w-0 flex-1 flex-col">
                      <span class="truncate text-body text-ink-2">{{ item.category.name }}</span>
                      <span class="truncate text-caption text-ink-3">{{ item.groupName }}</span>
                    </span>
                    <button
                      appIconButton
                      type="button"
                      icon="archive-restore"
                      [label]="
                        'categories.archived.restore' | transloco: { name: item.category.name }
                      "
                      (click)="store.restore(item.category.id)"
                    ></button>
                    <button
                      appIconButton
                      type="button"
                      icon="trash-2"
                      class="text-status-critical"
                      [label]="
                        'categories.archived.delete' | transloco: { name: item.category.name }
                      "
                      (click)="remove(item.category)"
                    ></button>
                  </li>
                }
              </ul>
            }
          </section>
        }
      </div>
    }
  `,
})
export default class CategoriesPage implements OnInit {
  protected readonly store = inject(CategoriesPageStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)
  private readonly toasts = inject(ToastStore)

  protected readonly reorderMode = signal(false)
  protected readonly showArchived = signal(false)
  protected readonly renaming = signal<number | null>(null)
  protected readonly adding = signal<number | null>(null)

  private readonly newName = viewChild<ElementRef<HTMLInputElement>>('newName')

  constructor() {
    // The inline "new category" field takes focus as soon as it appears.
    afterRenderEffect(() => {
      if (this.adding() !== null) {
        this.newName()?.nativeElement.focus()
      }
    })
  }

  ngOnInit(): void {
    void this.store.load()
  }

  protected glyph(category: TreeCategory): IconName {
    return categoryIcon(category)
  }

  protected dropped(event: CdkDragDrop<number, number, number>): void {
    if (event.previousContainer === event.container && event.previousIndex === event.currentIndex) {
      return
    }
    void this.store.move(event.item.data, event.container.data, event.currentIndex)
  }

  protected rename(category: TreeCategory, name: string): void {
    this.renaming.set(null)
    void this.store.rename(category.id, name)
  }

  protected create(groupId: number, name: string): void {
    if (this.adding() !== groupId) {
      return
    }
    this.adding.set(null)
    void this.store.create(groupId, name)
  }

  protected pickIcon(category: TreeCategory): void {
    this.sheets
      .open<IconName, IconPickerData>(IconPickerSheetComponent, {
        data: {
          title: this.transloco.translate(KEYS.iconTitle, { name: category.name }),
          selected: categoryIcon(category),
        },
      })
      .closed.subscribe((icon) => {
        if (icon) {
          void this.store.setIcon(category.id, icon)
        }
      })
  }

  protected async remove(category: TreeCategory): Promise<void> {
    const outcome = await this.store.remove(category.id)
    if (outcome === 'deleted') {
      this.toasts.show({ messageKey: 'categories.toast.deleted', status: 'good' })
      return
    }
    if (outcome !== 'inUse') {
      return
    }
    const options = this.store
      .options()
      .filter((option) => option.id !== category.id)
      .map((option) => ({
        value: option.id,
        label: option.name,
        meta: option.groupName,
        icon: categoryIcon(option),
      }))
    openSelectSheet(this.sheets, {
      title: this.transloco.translate(KEYS.reassignTitle, { name: category.name }),
      options,
    }).subscribe(async (target) => {
      if (target !== undefined && (await this.store.remove(category.id, target)) === 'deleted') {
        this.toasts.show({ messageKey: 'categories.toast.deleted', status: 'good' })
      }
    })
  }
}
