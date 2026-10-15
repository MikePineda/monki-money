# TextField

A labelled single-line input on `surface-1` with a 1px `line-strong` border, 48px tall. The label sits above in `label` / `ink-2`; helper text below in `caption` / `ink-3`.

- Focus: 2px `accent` border, no glow.
- Error: 2px `status-critical` border, then `circle-alert` and the message in `status-critical` (≥4.5:1 in both themes). Say what is wrong and how to fix it.
- Amounts never go in a text field; they come from the AmountKeypad.
- Provide: `id`, `label`, optional helper and error text, `autocomplete` where it applies.
