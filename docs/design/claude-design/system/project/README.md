monkimoney is a shared finance app for one household of two adults in Brisbane, AUD only. It reads like a calm financial editor: one hero number per view, typography for hierarchy, hairlines instead of boxes, and data as the only loud thing on screen. Light is the default; the dark theme is designed with its own steps.

The full specification, in the format Stitch reads, lives in the product repo at `docs/design/DESIGN.md`. This system holds the same tokens and shows each component in both themes.

## Consuming this system

- Load Inter from Google Fonts (`family=Inter:opsz,wght@14..32,400..600`), then `tokens.css`, then `components/bundle.css`. There is no JavaScript bundle; components are HTML plus the `mm-*` classes.
- Wrap a screen in an element with class `mm`. Set `data-theme="dark"` on it (or on `<html>`) for the dark theme.
- Use tokens by name (`var(--surface-0)`, `var(--accent)`). A literal hex in a component is a bug.

## Voice

- Bilingual from day one: es-MX and en-AU, same structure. Sentence case everywhere, including buttons.
- Short declarative sentences. No exclamation marks, no emoji, no jokes about money. Buttons start with a verb and say what happens ("Guardar gasto", "Importar CSV").
- People are "Tú" and "{pareja}" (en-AU "You" and "{partner}"). Never assume or show a real name.
- Dates are day-first: "15 oct 2026", "mié 15 oct" (en-AU "15 Oct 2026", "Wed 15 Oct"). Money is "$" with two decimals and a true minus: "−$42.50".

## Colour

- Page on `surface-0`; raised things (cards, sheets, fields, toasts) on `surface-1`; sunken fills (segmented track, chips at rest, skeletons, pressed rows) on `surface-2`.
- Text in `ink-1`, secondary text in `ink-2`, captions and ticks in `ink-3`. All three hold 4.5:1 on every surface in both themes.
- `accent` (deep bottle green) only for links, focus, selected segments, chips and months, the active tab and selection washes (`accent-soft`). `accent-ink` is only for text on the rare accent-filled element (a checked checkbox). The accent never fills a button and never colours an amount or a chart mark.
- Primary buttons and the tab bar's add button are ink: `ink-1` fill with the label or icon in `surface-0` (ink-black on light, ink-white on dark).
- Expenses in `expense` (= ink). Income in `income` (leaf green) with a "+". Transfers in `transfer` with the `arrow-left-right` icon and no sign.
- People only on marks: `person-a` (blue) and `person-b` (orange) for dots and bar segments; `mark-muted` for shared. Never as text colour.
- Status (`status-good`, `status-warning`, `status-serious`, `status-critical`) always as an icon plus words. `status-critical` is the only red: errors and destructive actions.
- Hairlines: `line` for dividers; `line-strong` for borders that must be seen (fields, chips, checkboxes; ≥3:1). Focus is a 2px solid `focus` ring with a 2px surface gap.

## Type

- Inter variable, weights 400/500/600, `font-optical-sizing: auto`. No second family.
- `display` for the one hero amount (proportional figures, −0.02em). `title` for screen titles and stat values. `heading` for section, sheet and chart titles. `body` / `body-strong` for text and button labels. `label` for controls. `eyebrow` (uppercase) for at most one label per section. `caption` for metadata and ticks.
- Every column of amounts, totals, ticks and the keypad uses tabular figures (`amount`, `tnum`). Only the hero and stat values are proportional.

## Layout, shape and depth

- 8px grid with a 4px half-step. 16px side gutter; 56px rows; 32px between sections; 44px minimum tap targets (48 for primary controls, 56 for keys and the bottom button). Primary actions sit at the bottom for one-handed use.
- Radii: `radius-sm` 4, `radius-md` 8, `radius-lg` 12, `radius-sheet` 16. `radius-full` only for dots, avatars, the drag handle and progress ends. No pills.
- Flat by default. `elevation-2` only for sheets, toasts, tooltips and the bulk bar, and only in light; dark uses surface steps. No cards inside cards. No gradients, no blur, no glass.

## Motion

- Only bottom sheets (200ms in, 150ms out), toasts (150ms) and segment changes (150ms) move, all on `ease-out`. Under reduced motion they fade without moving.
- No page transitions, count-ups, chart grow-ins or hover lifts. Saving gives a short haptic pulse and a toast.

## Iconography

- Lucide only, 20px, stroke 1.75, round caps and joins, coloured with `currentColor` from an ink or status token. 24px only in empty states and the add button. Icons in these previews are copied from lucide-static 0.460.0.
- No emoji as icons, no illustrations, no mascots. Category icons come from one fixed Lucide set.

## Charts

- Single-series charts (spend by category, the 6-month trend) use `mark-neutral` and no legend. People use `person-a` / `person-b` / `mark-muted`. Multi-series category charts use `series-1`…`series-8` in fixed order, at most six hued series plus "Otros". A screen never shows a person chart next to a category-hued chart, because `series-1` and `series-2` share the person hues.
- Bars ≤24px, 4px rounded data-end, square at the baseline, 2px surface gaps. Lines 2px, markers ≥8px with a 2px surface ring. One axis. Solid hairline `gridline` and `baseline`. Legend for two or more series. Text never in a series colour. A table view for every chart.
- No donut, pie, 3D or dual-axis charts; no dashed gridlines; no accent-coloured marks.
- The categorical and person palettes pass the dataviz validator in both themes (light against `#f8fbf9`, dark against `#0c0f0d`).

## Components

Button, TextField, AmountDisplay, AmountKeypad, SegmentedControl, Chip, ListRow, Card, BottomSheet, MonthPicker, StatTile, ReviewRow, EmptyState, Toast, Banner, Progress, TabBar, CategoryTile and ChartFrame each have guidelines and a live preview. Badge (20px, `surface-2`, `ink-2`) and Skeleton (`surface-2` blocks, radius 4, first load only) are described in DESIGN.md.
