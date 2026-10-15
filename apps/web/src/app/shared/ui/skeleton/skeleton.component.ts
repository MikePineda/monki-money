import { Component, input } from '@angular/core'

/**
 * Placeholder block at the size of the content it stands for (DESIGN.md,
 * Skeleton): surface-2, radius 4, a gentle pulse that stops under reduced
 * motion. Only for first loads; refetches keep the previous render instead.
 */
@Component({
  selector: 'app-skeleton',
  template: '',
  host: {
    'class': 'block animate-skeleton rounded-sm bg-surface-2',
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
  },
})
export class SkeletonComponent {
  /** Any CSS length: "100%", "120px", "12ch". */
  readonly width = input('100%')
  readonly height = input('16px')
}
