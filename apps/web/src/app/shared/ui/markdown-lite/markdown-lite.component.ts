import { NgTemplateOutlet } from '@angular/common'
import { Component, computed, input } from '@angular/core'
import { parseMarkdownLite } from '../../../domain/markdown-lite'

/**
 * Renders model-written Markdown (paragraphs, **strong**, - lists) through
 * Angular templates only: every piece of text is interpolated, so raw HTML
 * in the source is shown as text and never becomes markup. Each run sits in
 * its own element so the template adds no whitespace between runs.
 */
@Component({
  selector: 'app-markdown-lite',
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #runs let-spans>
      @for (span of spans; track $index) {
        @if (span.strong) {
          <strong class="font-semibold">{{ span.text }}</strong>
        } @else {
          <span>{{ span.text }}</span>
        }
      }
    </ng-template>
    @for (block of blocks(); track $index) {
      @if (block.kind === 'paragraph') {
        <p>
          <ng-container *ngTemplateOutlet="runs; context: { $implicit: block.spans }" />
        </p>
      } @else {
        <ul class="flex list-disc flex-col gap-1 pl-5">
          @for (item of block.items; track $index) {
            <li><ng-container *ngTemplateOutlet="runs; context: { $implicit: item }" /></li>
          }
        </ul>
      }
    }
  `,
  host: { class: 'flex max-w-[65ch] flex-col gap-3 text-body text-ink-1' },
})
export class MarkdownLiteComponent {
  readonly source = input.required<string>()

  protected readonly blocks = computed(() => parseMarkdownLite(this.source()))
}
