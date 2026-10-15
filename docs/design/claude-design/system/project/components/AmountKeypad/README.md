# AmountKeypad

The only way to enter money. A 3 × 4 grid (1–9, 00, 0, ⌫) of 56px keys separated by 1px `line` hairlines, with no key borders. Digits use `title` at weight 500, tabular. Pressed key: `surface-2`.

- Entry shifts in from the cents: 4 → $0.04, 4 2 → $0.42, 4 2 5 0 → $42.50; "00" appends two zeros. The value is integer cents (max $999,999.99).
- Long-press ⌫ clears. Each key press announces the formatted amount to screen readers.
- Provide: the bound value in cents (`FormValueControl<number>`) and the locale. The keypad spans the full gutter width.
