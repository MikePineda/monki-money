# ListRow

A 56px transaction row. Leading 36px `surface-2` square (radius 8) with the category's Lucide icon; merchant in `body`; metadata in `caption` / `ink-3` with the payer's 8px dot; trailing AmountDisplay row amount. Hairline `line` divider inset 64px.

- Pressed: `surface-2`. Long-press opens Editar / Duplicar / Eliminar.
- Day-group header (`mm-dayhead`): 32px, day label left in `label` / `ink-2`, subtotal right in tabular `ink-3`, sticky.
- A private transaction shows "Privado" instead of merchant and category to the other member; the amount still counts.
- Provide: merchant, category icon, account, payer (a, b or shared), amount in cents, type.
