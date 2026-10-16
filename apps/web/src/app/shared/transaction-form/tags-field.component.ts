import { Component, computed, input, model, signal } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { suggestTags } from '../../domain/tags'
import { IconComponent } from '../icons/icon.component'
import { ChipComponent } from '../ui/chip/chip.component'
import { TextFieldComponent } from '../ui/text-field/text-field.component'
import { provideTransactionFormI18n } from './transaction-form-i18n'
import { addTag } from './transaction-draft'

/**
 * Tags of a transaction (or of both legs of a transfer): the chosen ones
 * as removable chips, free text to type a new one, and the household's
 * tags as one-tap suggestions (most recently used first, narrowed by what
 * is typed). Presentational: the host passes the known tags.
 */
@Component({
  selector: 'app-tags-field',
  providers: [provideTransactionFormI18n()],
  imports: [ChipComponent, IconComponent, TextFieldComponent, TranslocoPipe],
  template: `
    <span class="text-label text-ink-2">{{ 'transactionForm.form.tags' | transloco }}</span>
    @if (tags().length > 0) {
      <ul class="flex flex-wrap gap-2" [attr.data-testid]="testId() + 's'">
        @for (tag of tags(); track tag) {
          <li>
            <button
              type="button"
              class="inline-flex h-9 max-w-full items-center gap-1.5 rounded-md border border-line-strong bg-surface-1 pr-2 pl-3 text-label text-ink-1 active:bg-surface-2"
              [attr.aria-label]="'transactionForm.form.removeTag' | transloco: { tag }"
              (click)="remove(tag)"
            >
              <span class="truncate">{{ tag }}</span
              ><app-icon name="x" [size]="16" />
            </button>
          </li>
        }
      </ul>
    }
    <div class="flex items-end gap-2">
      <app-text-field
        class="min-w-0 flex-1"
        autocomplete="off"
        [attr.data-testid]="testId()"
        [label]="'transactionForm.form.addTag' | transloco"
        [error]="error()"
        [(value)]="text"
        (keydown.enter)="$event.preventDefault(); commit()"
      />
      <button
        type="button"
        class="mb-0 grid size-12 shrink-0 place-items-center rounded-md border border-line-strong bg-surface-1 text-ink-1 active:bg-surface-2 disabled:text-ink-3"
        [attr.aria-label]="'transactionForm.form.addTag' | transloco"
        [disabled]="!text().trim()"
        (click)="commit()"
      >
        <app-icon name="plus" />
      </button>
    </div>
    @if (suggestions().length > 0) {
      <div
        class="flex flex-wrap gap-2"
        role="group"
        [attr.data-testid]="testId() + 'Suggestions'"
        [attr.aria-label]="'transactionForm.form.tagSuggestions' | transloco"
      >
        @for (tag of suggestions(); track tag) {
          <button
            appChip
            icon="tag"
            [attr.aria-label]="'transactionForm.form.addSuggestedTag' | transloco: { tag }"
            (click)="add(tag)"
          >
            {{ tag }}
          </button>
        }
      </div>
    }
  `,
  host: { class: 'flex flex-col gap-2' },
})
export class TagsFieldComponent {
  readonly tags = model<string[]>([])
  /** The household's tags, most recently used first. */
  readonly known = input<readonly string[]>([])
  readonly error = input('')
  /** `data-testid` of the text field (the chips and suggestions take it as a prefix). */
  readonly testId = input('transactions.form.tag')

  protected readonly text = signal('')
  protected readonly suggestions = computed(() =>
    suggestTags(this.known(), this.tags(), this.text())
  )

  protected commit(): void {
    this.add(this.text())
  }

  protected add(tag: string): void {
    this.tags.set(addTag(this.tags(), tag))
    this.text.set('')
  }

  protected remove(tag: string): void {
    this.tags.set(this.tags().filter((item) => item !== tag))
  }
}
