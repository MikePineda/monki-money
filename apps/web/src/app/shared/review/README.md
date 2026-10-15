# Review before save

The pattern for anything a machine proposes and a person confirms: bank
imports (`features/import`) and a scanned receipt's lines (`features/scan`). Three pieces,
generic over the consumer's row view model, with no API, store or
translation of their own (labels come in as inputs, already worded).

| Piece           | File                       | Role                                                                                                          |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ReviewList<T>` | `review-list.component.ts` | The list: leading 44px checkbox, selection, progressive rendering. The row itself is the consumer's template. |
| `appReviewRow`  | `review-row.directive.ts`  | Marks the row template: `let-row` (the item), `let-selected="selected"`, `let-i="index"`.                     |
| `RowTriage`     | `row-triage.component.ts`  | The frame of a row's triage sheet: summary (heading, facts, amount, status) and slots.                        |
| `BulkBar`       | `bulk-bar.component.ts`    | Fixed bottom toolbar for the selection: clear, the count, the consumer's actions.                             |

## `app-review-list`

| Input / model    | Type                                       | Notes                                                               |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `items`          | `readonly T[]` (required)                  | Already filtered and in display order.                              |
| `key`            | `(item: T) => string \| number` (required) | Track key and selection key.                                        |
| `label`          | `string` (required)                        | Accessible name of the list.                                        |
| `checkLabel`     | `(item: T) => string` (required)           | Accessible name of each checkbox ("Select Corner Grocer, −$42.50"). |
| `selectable`     | `(item: T) => boolean`                     | Default: every item. Others keep an empty 44px slot.                |
| `emphasis`       | `(item: T) => 'rest' \| 'raised'`          | `raised` = surface-1 card with a line border (the doubtful row).    |
| `selectAllLabel` | `string`                                   | Shows a "select all" row above the list when set.                   |
| `moreLabel`      | `string`                                   | The "show more" button where IntersectionObserver is missing.       |
| `pageSize`       | `number`                                   | Rows rendered first (60); more as the end comes into view.          |
| `selected`       | `model<ReadonlySet<key>>`                  | Two-way: `[(selected)]="selection"`.                                |

```html
<app-review-list
  [items]="rows()"
  [key]="keyOf"
  [label]="'import.review.listLabel' | transloco"
  [checkLabel]="checkLabelOf"
  [selectable]="canSelect"
  [emphasis]="emphasisOf"
  [(selected)]="selection"
>
  <ng-template appReviewRow [appReviewRowOf]="rows()" let-row let-selected="selected">
    <app-my-row [row]="row" (opened)="open(row)" />
  </ng-template>
</app-review-list>
```

The row template owns its interactions (open the triage sheet on tap,
inline "Accept" / "Change" on a doubtful row); never nest them inside one
big button.

## `app-row-triage`

Inputs: `title`, `heading`, `amountCents`, `closeLabel` (required), `meta`
(facts joined with " · "), `kind` (`expense | income | transfer`), `status`
(`{ icon, label, tone }`, the icon in the status colour, the words in ink).
Slots: `[triageSummary]` (extra summary lines), the default slot (the
decisions) and `[triageFooter]` (the primary action, fixed at the bottom).
The consumer's sheet component wraps it and is opened with
`BottomSheetService`, passing the opener's injector when it needs the
page's store or translation scope.

## `app-bulk-bar`

Inputs: `countLabel` ("2 selected", plural rules stay in the consumer's
catalogue), `clearLabel`, `label` (toolbar name). Output: `cleared`.
Project the actions as buttons: `[bulkAside]` sits next to the count (a
quiet action such as "Ignore"), the rest share the row below (secondary
first, the single primary last). The bar is `fixed` to the bottom edge
over the safe area; give the page enough bottom padding to scroll past it.
