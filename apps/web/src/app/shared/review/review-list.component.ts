import { NgTemplateOutlet } from '@angular/common'
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  contentChild,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core'
import { IconComponent } from '../icons/icon.component'
import { ReviewRowDirective, type ReviewRowContext } from './review-row.directive'

/** What identifies an item across renders and in the selection. */
export type ReviewKey = string | number

/**
 * How a row sits in the list: `rest` on the page with a hairline below,
 * `raised` on a surface-1 card with a 1px line border (DESIGN.md, Review
 * row: the doubtful row stands out).
 */
export type RowEmphasis = 'rest' | 'raised'

/** Items rendered at first; more are added as the end of the list comes into view. */
export const REVIEW_PAGE_SIZE = 60

interface RowView<T> {
  key: ReviewKey
  selectable: boolean
  selected: boolean
  emphasis: RowEmphasis
  checkLabel: string
  context: ReviewRowContext<T>
}

const CHECKBOX =
  'absolute inset-0 m-0 size-5 cursor-pointer appearance-none rounded-sm border border-line-strong ' +
  'bg-surface-1 checked:border-accent checked:bg-accent indeterminate:border-accent indeterminate:bg-accent'

/**
 * The review-before-save list (DESIGN.md, Review row), shared by the bank
 * import and the receipt scanner. Generic over the row view model: the
 * list owns the 44px leading checkbox, the selection (a set of keys, two
 * way bound) and the rendering budget; the consumer's `appReviewRow`
 * template draws the row itself (title, amount, status, inline actions).
 *
 * Long lists render {@link REVIEW_PAGE_SIZE} rows first and grow as the
 * end comes into view (a "Show more" button where IntersectionObserver is
 * missing); every row also skips layout off screen (`content-visibility`).
 */
@Component({
  selector: 'app-review-list',
  imports: [IconComponent, NgTemplateOutlet],
  template: `
    @if (selectAllLabel() && selectableCount() > 0) {
      <label
        class="flex h-11 cursor-pointer items-center gap-3 pr-4 pl-3 text-label text-ink-2"
        data-testid="review.selectAll"
      >
        <span class="relative grid size-5 shrink-0 place-items-center">
          <input
            type="checkbox"
            [class]="checkboxClass"
            [checked]="allSelected()"
            [indeterminate]="someSelected()"
            (change)="toggleAll()"
          />
          @if (allSelected()) {
            <app-icon
              name="check"
              [size]="16"
              class="pointer-events-none relative text-accent-ink"
            />
          } @else if (someSelected()) {
            <span
              class="pointer-events-none relative h-0.5 w-2.5 rounded-full bg-accent-ink"
            ></span>
          }
        </span>
        <span>{{ selectAllLabel() }}</span>
      </label>
    }
    <ul class="flex flex-col" [attr.aria-label]="label()">
      @for (row of rows(); track row.key) {
        <li
          class="review-item flex items-start"
          data-testid="review.item"
          [class]="
            row.emphasis === 'raised'
              ? 'mx-2 my-1 rounded-lg border border-line bg-surface-1'
              : 'border-b border-line'
          "
          [attr.data-key]="row.key"
          [attr.data-selected]="row.selected || null"
        >
          @if (row.selectable) {
            <label class="mt-1.5 grid size-11 shrink-0 cursor-pointer place-items-center">
              <span class="relative grid size-5 place-items-center">
                <input
                  type="checkbox"
                  data-testid="review.check"
                  [class]="checkboxClass"
                  [checked]="row.selected"
                  [attr.aria-label]="row.checkLabel"
                  (change)="toggle(row.key)"
                />
                @if (row.selected) {
                  <app-icon
                    name="check"
                    [size]="16"
                    class="pointer-events-none relative text-accent-ink"
                  />
                }
              </span>
            </label>
          } @else {
            <span class="size-11 shrink-0" aria-hidden="true"></span>
          }
          <div class="min-w-0 flex-1">
            <ng-container
              [ngTemplateOutlet]="template()?.template ?? null"
              [ngTemplateOutletContext]="row.context"
            />
          </div>
        </li>
      }
    </ul>
    @if (hasMore()) {
      <div #more class="flex justify-center px-4 py-4">
        <button
          type="button"
          class="h-11 rounded-md px-3 text-body-strong text-accent active:bg-surface-2"
          data-testid="review.more"
          (click)="showMore()"
        >
          {{ moreLabel() }}
        </button>
      </div>
    }
  `,
  styles: `
    .review-item {
      content-visibility: auto;
      contain-intrinsic-size: auto 56px;
    }
  `,
  host: { class: 'block' },
})
export class ReviewListComponent<T> {
  readonly items = input.required<readonly T[]>()
  /** A stable id per item (track and selection). */
  readonly key = input.required<(item: T) => ReviewKey>()
  /** Accessible name of the list. */
  readonly label = input.required<string>()
  /** Accessible name of an item's checkbox ("Select Corner Grocer, −$42.50"). */
  readonly checkLabel = input.required<(item: T) => string>()
  /** Items that can be picked for a bulk action; the rest get an empty slot. */
  readonly selectable = input<(item: T) => boolean>(() => true)
  readonly emphasis = input<(item: T) => RowEmphasis>(() => 'rest')
  /** Shows a "select all" row above the list when set. */
  readonly selectAllLabel = input('')
  /** The "show more" button, for browsers without IntersectionObserver. */
  readonly moreLabel = input('')
  readonly pageSize = input(REVIEW_PAGE_SIZE)
  readonly selected = model<ReadonlySet<ReviewKey>>(new Set())

  protected readonly checkboxClass = CHECKBOX
  protected readonly template = contentChild<ReviewRowDirective<T>>(ReviewRowDirective)
  private readonly moreAnchor = viewChild<ElementRef<HTMLElement>>('more')
  private readonly extra = signal(0)

  private readonly limit = computed(() => this.pageSize() + this.extra())
  protected readonly hasMore = computed(() => this.items().length > this.limit())

  private readonly selectableKeys = computed(() => {
    const key = this.key()
    const selectable = this.selectable()
    return this.items()
      .filter((item) => selectable(item))
      .map((item) => key(item))
  })
  protected readonly selectableCount = computed(() => this.selectableKeys().length)
  protected readonly allSelected = computed(() => {
    const keys = this.selectableKeys()
    const selected = this.selected()
    return keys.length > 0 && keys.every((key) => selected.has(key))
  })
  protected readonly someSelected = computed(
    () => !this.allSelected() && this.selectableKeys().some((key) => this.selected().has(key))
  )

  protected readonly rows = computed<RowView<T>[]>(() => {
    const key = this.key()
    const selectable = this.selectable()
    const emphasis = this.emphasis()
    const checkLabel = this.checkLabel()
    const selected = this.selected()
    return this.items()
      .slice(0, this.limit())
      .map((item, index) => {
        const id = key(item)
        const isSelected = selected.has(id)
        return {
          key: id,
          selectable: selectable(item),
          selected: isSelected,
          emphasis: emphasis(item),
          checkLabel: checkLabel(item),
          context: { $implicit: item, selected: isSelected, index },
        }
      })
  })

  constructor() {
    const destroyRef = inject(DestroyRef)
    let observer: IntersectionObserver | null = null
    destroyRef.onDestroy(() => observer?.disconnect())
    // Grow the list as its end comes near the viewport.
    effect(() => {
      const anchor = this.moreAnchor()?.nativeElement
      observer?.disconnect()
      if (!anchor || typeof IntersectionObserver === 'undefined') {
        return
      }
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.showMore()
          }
        },
        { rootMargin: '400px 0px' }
      )
      observer.observe(anchor)
    })
  }

  showMore(): void {
    this.extra.update((count) => count + this.pageSize())
  }

  toggle(key: ReviewKey): void {
    this.selected.update((current) => {
      const next = new Set(current)
      if (!next.delete(key)) {
        next.add(key)
      }
      return next
    })
  }

  toggleAll(): void {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.selectableKeys()))
  }
}
