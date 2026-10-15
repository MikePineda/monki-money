# AmountDisplay

How money is set. One hero per view; every other amount is tabular and right-aligned.

- **Hero**: `display` (44/48, weight 500, −0.02em), proportional figures, `ink-1`. Cents may drop to `ink-2` at the same size. In quick add the hero shows the unsigned amount being typed; the segment states the type and the save button repeats it with its sign.
- **Row**: `amount` (16/24, weight 500), tabular figures, right-aligned.
  - Expense: `expense` (= ink) with a true minus: "−$84.20".
  - Income: `income` with a plus: "+$3,200.00".
  - Transfer: `transfer` with the `arrow-left-right` icon and no sign: "$500.00".
- Format with `Intl.NumberFormat` (`currencyDisplay: 'narrowSymbol'`) so es-MX and en-AU both read "$1,284.50"; replace the hyphen with U+2212.
