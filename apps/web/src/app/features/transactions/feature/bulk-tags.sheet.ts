import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { TagsFieldComponent } from '../../../shared/transaction-form/tags-field.component'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'

export interface BulkTagsData {
  /** How many transactions are selected. */
  count: number
  /** Tags the selected rows carry now (any of them), offered for removal. */
  current: readonly string[]
  /** The household's tags, most recently used first (suggestions to add). */
  known: readonly string[]
}

/** The change the sheet closes with. */
export interface BulkTagChanges {
  add: string[]
  remove: string[]
}

/**
 * Tags for a selection of transactions: tags to add (typed, or one tap on
 * the household's tags) and, when the selected rows carry any, the ones to
 * take off every row (toggle chips). "Apply" closes with both lists; the
 * list page sends them in one request.
 */
@Component({
  selector: 'app-bulk-tags-sheet',
  imports: [
    BottomSheetComponent,
    ButtonComponent,
    ChipComponent,
    TagsFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet
      [title]="'transactions.bulkTags.title' | transloco: { count: data.count }"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <div class="flex flex-col gap-6 px-4 pb-4" data-testid="transactions.bulkTags">
        <div class="flex flex-col gap-1">
          <app-tags-field testId="transactions.bulkTags.add" [known]="data.known" [(tags)]="add" />
          <p class="text-caption text-ink-3">{{ 'transactions.bulkTags.addHint' | transloco }}</p>
        </div>
        @if (data.current.length > 0) {
          <div class="flex flex-col gap-2">
            <span class="text-label text-ink-2">{{
              'transactions.bulkTags.remove' | transloco
            }}</span>
            <div
              class="flex flex-wrap gap-2"
              role="group"
              data-testid="transactions.bulkTags.current"
              [attr.aria-label]="'transactions.bulkTags.remove' | transloco"
            >
              @for (tag of data.current; track tag) {
                <button
                  appChip
                  pressable
                  icon="tag"
                  [selected]="remove().includes(tag)"
                  [attr.aria-label]="'transactions.bulkTags.removeTag' | transloco: { tag }"
                  (click)="toggleRemove(tag)"
                >
                  {{ tag }}
                </button>
              }
            </div>
            <p class="text-caption text-ink-3">
              {{ 'transactions.bulkTags.removeHint' | transloco }}
            </p>
          </div>
        }
      </div>
      <div sheetFooter>
        <button
          appButton
          type="button"
          size="block"
          data-testid="transactions.bulkTags.apply"
          [disabled]="!changed()"
          (click)="apply()"
        >
          {{ 'transactions.bulkTags.apply' | transloco }}
        </button>
      </div>
    </app-bottom-sheet>
  `,
})
export class BulkTagsSheetComponent {
  protected readonly data = inject<BulkTagsData>(DIALOG_DATA)
  private readonly dialogRef = inject<DialogRef<BulkTagChanges>>(DialogRef)

  protected readonly add = signal<string[]>([])
  protected readonly remove = signal<string[]>([])

  protected readonly changed = computed(() => this.add().length > 0 || this.remove().length > 0)

  protected toggleRemove(tag: string): void {
    this.remove.update((tags) =>
      tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]
    )
  }

  protected apply(): void {
    if (this.changed()) {
      this.dialogRef.close({ add: this.add(), remove: this.remove() })
    }
  }
}
