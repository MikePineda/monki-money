import { DialogRef } from '@angular/cdk/dialog'
import { Component, inject } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { BottomSheetComponent } from '../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../shared/ui/button/button.component'

/** A plain bottom sheet for the gallery: scrolling body and a primary action in the footer. */
@Component({
  selector: 'app-kit-demo-sheet',
  imports: [BottomSheetComponent, ButtonComponent, TranslocoPipe],
  template: `
    <app-bottom-sheet
      [title]="'kit.sheet.demoTitle' | transloco"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <div class="flex flex-col gap-4 px-4 pb-2">
        @for (paragraph of paragraphs; track paragraph) {
          <p class="text-body text-ink-2">{{ 'kit.sheet.demoBody' | transloco }}</p>
        }
      </div>
      <button sheetFooter appButton type="button" size="block" (click)="dialogRef.close()">
        {{ 'kit.sheet.demoAction' | transloco }}
      </button>
    </app-bottom-sheet>
  `,
})
export class KitDemoSheetComponent {
  protected readonly dialogRef = inject(DialogRef)
  protected readonly paragraphs = [1, 2, 3]
}
