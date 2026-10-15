import { Directive, TemplateRef, inject, input } from '@angular/core'

/** What a row template receives from {@link ReviewListComponent}. */
export interface ReviewRowContext<T> {
  $implicit: T
  /** The row's checkbox is ticked. */
  selected: boolean
  index: number
}

/**
 * Marks the template a ReviewList renders for each item, next to the
 * leading checkbox the list owns:
 *
 * ```html
 * <ng-template appReviewRow [appReviewRowOf]="rows()" let-row let-selected="selected">…</ng-template>
 * ```
 *
 * `appReviewRowOf` only types `let-row` (it repeats the list's items).
 */
@Directive({ selector: 'ng-template[appReviewRow]' })
export class ReviewRowDirective<T> {
  readonly template = inject<TemplateRef<ReviewRowContext<T>>>(TemplateRef)
  readonly appReviewRowOf = input<readonly T[]>([])

  /** Types the template's context for the compiler (never called at runtime). */
  static ngTemplateContextGuard<T>(
    directive: ReviewRowDirective<T>,
    context: unknown
  ): context is ReviewRowContext<T> {
    return directive instanceof ReviewRowDirective && typeof context === 'object'
  }
}
