import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco'
import { failureMessage } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { TagsApi } from '../../../core/ledger/tags.api'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'

/** The longest tag the API takes (trimmed). */
const MAX_TAG_LENGTH = 40
/** Full key, translated on demand: t(tags.detail.rename.tooLong) */
const TOO_LONG_KEY = 'tags.detail.rename.tooLong'

export interface RenameTagData {
  tag: string
  /** The household's tags the reader can see: typing one of them merges the two. */
  known: readonly string[]
}

/** What the sheet closes with once the API renamed the tag. */
export interface RenamedTag {
  tag: string
  updated: number
  merged: boolean
}

/**
 * Rename a tag everywhere (`PATCH /tags/:tag`): one field with the current
 * name. Typing the name of another tag says, before saving, that both
 * become one ("Merge tags"); changing only the case is a rename. A 422
 * stays under the field; anything else shows above it. Closes with the
 * result, or undefined when dismissed.
 */
@Component({
  selector: 'app-rename-tag-sheet',
  imports: [
    BannerComponent,
    BottomSheetComponent,
    ButtonComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet
      [title]="'tags.detail.rename.title' | transloco"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <div class="flex flex-col gap-4 px-4 pb-4" data-testid="tags.rename">
        @if (failure(); as message) {
          <app-banner status="critical" [message]="message" />
        }
        <app-text-field
          autocomplete="off"
          data-testid="tags.rename.name"
          [label]="'tags.detail.rename.name' | transloco"
          [error]="error()"
          [(value)]="name"
          (keydown.enter)="$event.preventDefault(); save()"
        />
        @if (merging()) {
          <app-banner
            data-testid="tags.rename.merge"
            status="serious"
            icon="merge"
            [message]="
              'tags.detail.rename.mergeBody' | transloco: { tag: data.tag, name: target() }
            "
          />
        } @else {
          <p class="text-body text-ink-2">
            {{ 'tags.detail.rename.body' | transloco: { tag: data.tag } }}
          </p>
        }
      </div>
      <div sheetFooter>
        <button
          appButton
          type="button"
          size="block"
          data-testid="tags.rename.save"
          [icon]="merging() ? 'merge' : null"
          [disabled]="!canSave()"
          [loading]="saving()"
          (click)="save()"
        >
          {{ (merging() ? 'tags.detail.rename.merge' : 'tags.detail.rename.save') | transloco }}
        </button>
      </div>
    </app-bottom-sheet>
  `,
})
export class RenameTagSheetComponent {
  protected readonly data = inject<RenameTagData>(DIALOG_DATA)
  private readonly dialogRef = inject<DialogRef<RenamedTag>>(DialogRef)
  private readonly api = inject(TagsApi)
  private readonly transloco = inject(TranslocoService)

  protected readonly name = signal(this.data.tag)
  protected readonly saving = signal(false)
  protected readonly failure = signal('')
  private readonly serverError = signal('')

  /** The name as the API will store it. */
  protected readonly target = computed(() => this.name().trim())

  /** Another tag of the household already has this name: the two become one. */
  protected readonly merging = computed(
    () => this.target() !== this.data.tag && this.data.known.includes(this.target())
  )

  protected readonly error = computed(() => {
    if (this.target().length > MAX_TAG_LENGTH) {
      return this.transloco.translate(TOO_LONG_KEY, { max: MAX_TAG_LENGTH })
    }
    return this.serverError()
  })

  protected readonly canSave = computed(() => {
    const target = this.target()
    return (
      !this.saving() &&
      target.length > 0 &&
      target.length <= MAX_TAG_LENGTH &&
      target !== this.data.tag
    )
  })

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return
    }
    const merged = this.merging()
    this.saving.set(true)
    this.failure.set('')
    this.serverError.set('')
    try {
      const result = await this.api.rename(this.data.tag, this.target())
      this.dialogRef.close({ ...result, merged })
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        this.serverError.set(failure.fields['name'] ?? Object.values(failure.fields)[0] ?? '')
      } else if (failure.kind !== 'unauthorized') {
        const message = failureMessage(failure)
        this.failure.set(this.transloco.translate(message.key, message.params))
      }
    } finally {
      this.saving.set(false)
    }
  }
}
