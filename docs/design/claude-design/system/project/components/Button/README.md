# Button

One primary action per view, filled in ink (ink-black on light, ink-white on dark); everything else is quieter. The deep-green accent is never a button fill. Labels are sentence case and start with a verb ("Guardar gasto", "Save expense"). The bottom primary button is full-width, 56px tall, and may carry the outcome: "Guardar −$42.50".

- **Primary** (`mm-btn mm-btn--primary`): `ink-1` fill, label in `surface-0`; pressed `ink-2`. 48px inline, 56px with `mm-btn--block`.
- **Secondary** (`mm-btn--secondary`): `surface-1`, 1px `line-strong` border, `ink-1` label.
- **Ghost** (`mm-btn--ghost`) for low-emphasis actions; **link** (`mm-btn--link`) in `accent` for "Deshacer", "Ver todos".
- **Destructive** (`mm-btn--destructive`): `status-critical` border and label with `trash-2`. Never a red fill. Irreversible actions confirm in a sheet.
- **Icon button** (`mm-iconbtn`): 44 × 44, `aria-label` required.
- Disabled: `surface-2` fill, `ink-3` label. Loading keeps width and label and shows a 16px spinner.

Do: one primary per view, bottom-anchored on mobile. Don't: pill shapes, gradients, two filled buttons side by side.
