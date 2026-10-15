import { Component, input } from '@angular/core'
import { IconComponent } from '../../../shared/icons/icon.component'

/**
 * An inline field error (DESIGN.md, Text field: "a circle-alert icon and
 * the message in label / status-critical"), for the controls that are not
 * text fields: the amount, the chips, the category grid.
 */
@Component({
  selector: 'app-field-error',
  imports: [IconComponent],
  template: `
    <app-icon name="circle-alert" [size]="16" class="shrink-0" />
    <span>{{ message() }}</span>
  `,
  host: { class: 'flex items-center gap-1.5 text-label text-status-critical', role: 'alert' },
})
export class FieldErrorComponent {
  readonly message = input.required<string>()
}
