import { Component, input } from '@angular/core'

/**
 * Section heading (DESIGN.md, Layout): an optional uppercase eyebrow, the
 * title in `heading`, an optional caption, and an optional action on the
 * right (project an element with the `sectionAction` attribute).
 */
@Component({
  selector: 'app-section-header',
  template: `
    <div class="flex min-w-0 flex-col gap-0.5">
      @if (eyebrow()) {
        <p class="text-eyebrow uppercase text-ink-2">{{ eyebrow() }}</p>
      }
      <h2 class="text-heading text-ink-1">{{ title() }}</h2>
      @if (subtitle()) {
        <p class="text-caption text-ink-3">{{ subtitle() }}</p>
      }
    </div>
    <ng-content select="[sectionAction]" />
  `,
  host: { class: 'flex items-start justify-between gap-2' },
})
export class SectionHeaderComponent {
  readonly title = input.required<string>()
  readonly eyebrow = input('')
  readonly subtitle = input('')
}
