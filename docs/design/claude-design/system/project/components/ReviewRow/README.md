# ReviewRow

The review-before-save row used by import and the receipt scanner (`ReviewList`, `RowTriage`, `BulkBar`). A 44px leading checkbox, the transaction, and its state shown by icon shape plus a word, never colour alone.

- **Auto**: `circle-check` in `status-good` + "Auto"; the category is a plain value.
- **Dudosa**: `triangle-alert` in `status-warning` + "Revisar"; the row lifts to `surface-1` with a hairline; the suggestion is a chip with "Aceptar" and "Cambiar".
- **Nueva**: `circle-plus` in `ink-2` + "Nueva"; the chip reads "Sin categoría".
- Duplicates are hidden behind a filter and render in `ink-3` with `copy`.
- The BulkBar is fixed at the bottom: "N seleccionadas", primary "Aceptar sugeridas (M)", secondary "Asignar categoría".
