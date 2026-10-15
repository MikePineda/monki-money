# ChartFrame

Wraps every chart: a `heading` title, a `caption` subtitle in `ink-3`, a 44px icon button that toggles chart (`chart-bar`) and table (`table-2`) views, the legend (two or more series), the plot, and an optional footnote.

- Single-series marks use `mark-neutral`; "Otros" and shared use `mark-muted`; people use `person-a` / `person-b`. The accent is never a mark.
- Bars ≤24px with a 4px rounded data-end and a square baseline; 2px surface gaps between segments; lines 2px with ≥8px ringed markers; one axis; solid hairline `gridline` and `baseline`.
- Text is never in a series colour. Every chart has a table view (44px rows, tabular values, a total row).
- No donut, pie, dual-axis or dashed gridlines. Tooltips (`surface-1`, `elevation-2`) enhance and never gate a value.
