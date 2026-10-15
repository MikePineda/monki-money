---
name: monkimoney
colors:
  background: '#f8fbf9'
  on-background: '#131715'
  surface: '#f8fbf9'
  surface-dim: '#d8dcda'
  surface-bright: '#ffffff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f6f4'
  surface-container: '#edf1ef'
  surface-container-high: '#e7ebe9'
  surface-container-highest: '#e1e5e3'
  surface-variant: '#edf1ef'
  on-surface: '#131715'
  on-surface-variant: '#494e4b'
  inverse-surface: '#2a2f2c'
  inverse-on-surface: '#ecefed'
  outline: '#7c827e'
  outline-variant: '#dee2e0'
  surface-tint: '#131715'
  primary: '#131715'
  on-primary: '#f8fbf9'
  primary-container: '#dff5e7'
  on-primary-container: '#08633d'
  inverse-primary: '#ecefed'
  secondary: '#494e4b'
  on-secondary: '#ffffff'
  secondary-container: '#edf1ef'
  on-secondary-container: '#131715'
  tertiary: '#686d6a'
  on-tertiary: '#ffffff'
  tertiary-container: '#e7ebe9'
  on-tertiary-container: '#131715'
  error: '#c8393a'
  on-error: '#ffffff'
  error-container: '#fbe9e8'
  on-error-container: '#8e1f22'
  primary-fixed: '#dff5e7'
  primary-fixed-dim: '#a9dcbf'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#08633d'
  secondary-fixed: '#e1e5e3'
  secondary-fixed-dim: '#c4c9c6'
  on-secondary-fixed: '#131715'
  on-secondary-fixed-variant: '#494e4b'
  tertiary-fixed: '#e7ebe9'
  tertiary-fixed-dim: '#c4c9c6'
  on-tertiary-fixed: '#131715'
  on-tertiary-fixed-variant: '#494e4b'
  accent: '#08633d'
  accent-ink: '#ffffff'
  accent-soft: '#dff5e7'
  focus: '#08633d'
  line: '#dee2e0'
  line-strong: '#7c827e'
  income: '#3b7b1f'
  expense: '#131715'
  transfer: '#686d6a'
  person-a: '#2a78d6'
  person-b: '#eb6834'
  mark-neutral: '#606562'
  mark-muted: '#b4b9b6'
  series-1: '#2a78d6'
  series-2: '#eb6834'
  series-3: '#1baf7a'
  series-4: '#eda100'
  series-5: '#e87ba4'
  series-6: '#8d792a'
  series-7: '#6250d6'
  series-8: '#7c3b77'
  status-good: '#0ca30c'
  status-warning: '#b37903'
  status-serious: '#c0571e'
  status-critical: '#c8393a'
  gridline: '#e7eae8'
  baseline: '#bbbfbc'
typography:
  display:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: '500'
    lineHeight: 48px
    letterSpacing: -0.88px
  title:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.24px
  heading:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.09px
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0px
  body-strong:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0px
  amount:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0px
  label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.13px
  eyebrow:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.72px
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.12px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.5rem
  lg: 0.75rem
  xl: 1rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  gutter: 16px
  row: 56px
  tap-target: 48px
  container-max: 480px
---

## Brand & Style

monkimoney is a shared finance app for one household of two adults in Brisbane, in AUD only. It should feel like a calm, intelligent financial editor: it reads the month for you and lays it out like a well-set page. It is not a transactions table with a new name, and it must never look like a generic AI-generated app.

The style is **editorial minimal**. Light surfaces are the default and the dark theme is designed separately, with its own surface steps and its own validated data colours. Typography carries the hierarchy. Hairlines separate content instead of boxes, whitespace is generous, and lists are dense but breathable. The only loud thing on a screen is the data.

Principles, in priority order:

1. **The number is the hero.** Each view leads with exactly one large amount. Everything else supports it.
2. **Ink, not alarm.** Spending is the normal case, so expenses are set in ink. Red means an error or a destructive action and nothing else.
3. **One green, for selection.** The deep-green accent marks where you are and what you have chosen: links, the focus ring, the selected segment, chip or month, the active tab and the `accent-soft` selection wash. Primary buttons are ink: ink-black on light, ink-white on dark. The accent never fills a button and never colours an amount or a chart mark.
4. **Two people, one household.** People get colour only on marks (a dot, a bar segment). In text they are always words: "Tú" and "{pareja}" (en-AU: "You" and "{partner}"). The UI never assumes a name.
5. **Honest.** Empty states say what is missing and offer one action. Charts always have a table view. Numbers are exact to the cent, and anything estimated is labelled as an estimate.

**Voice.** Bilingual from day one: es-MX and en-AU, same structure, separate catalogues. Sentence case everywhere, including buttons ("Guardar gasto", "Save expense"). Short declarative sentences, no exclamation marks, no emoji, no jokes about money. Verbs on buttons state exactly what happens. Dates are day-first: es-MX "15 oct 2026", "mar 14 oct"; en-AU "15 Oct 2026", "Tue 14 Oct". Currency is "$" with two decimals and thousands separators ("$1,284.50" in both locales). Negative values use the true minus sign U+2212 ("−$42.50"), never a hyphen.

## Colors

All colours are semantic tokens. Components reference tokens only; a raw hex outside the token file is a bug. Light values are the defaults on `:root`; dark values apply under `[data-theme="dark"]` and under `prefers-color-scheme: dark` when no explicit theme is set. The front matter carries the light theme in Material role names for Stitch; the tables below are the full specification for both themes.

Roles at a glance:

- **Surfaces** step up by lightness in light mode (`surface-0` page, `surface-1` raised, `surface-2` sunken fills) and by lightness in dark mode too, never by shadow. The neutrals carry a faint bias toward the accent hue (OKLCH h≈160, C≤0.009), so the greys read as considered rather than default.
- **Ink** has three steps. `ink-1` for primary text and the hero amount, `ink-2` for secondary text, `ink-3` for captions, placeholders and tick labels. All three pass 4.5:1 on every surface in both themes.
- **Accent** is deep bottle green (`#08633d` light, `#5abb88` dark). It passes 7:1 on light surfaces and 7.5:1 on dark ones. It is never a button fill: primary buttons use `ink-1` with a `surface-0` label (17.4:1 light, 16.6:1 dark). `accent-soft` is the selection wash behind accent text. `accent-ink` is kept only for text or icons on the rare accent-filled element (a checked checkbox).
- **Money semantics.** `expense` = `ink-1`. `income` is a leaf green (OKLCH h≈138), lighter and yellower than the accent, and is only ever an amount with a "+" sign. `transfer` = `ink-3` plus the `arrow-left-right` glyph and no sign. The accent never colours an amount, and income never colours a control.
- **People.** `person-a` (blue) and `person-b` (orange) are the two strongest CVD-safe categorical hues. They appear only on marks: an 8px dot in a list row, a segment in the by-person bar, a 2px avatar ring. Text next to them stays in ink.
- **Status** (`good`, `warning`, `serious`, `critical`) is reserved for feedback. It always appears as a Lucide icon in the status colour plus a text label in ink. `status-critical` is the only red in the system, and it may also be used as text for field errors and destructive labels (≥4.5:1 in both themes).
- **Chart chrome.** `gridline` and `baseline` are solid hairlines. `mark-neutral` is the single-series mark colour (expense is ink, in charts too). `mark-muted` is for de-emphasised marks such as "Hogar/compartido" or "Otros".

### Light theme

| Token | Hex | Use |
|---|---|---|
| `--surface-0` | `#f8fbf9` | App/page background; chart surface. |
| `--surface-1` | `#ffffff` | Raised: cards, sheets, toasts, text fields, keypad keys. |
| `--surface-2` | `#edf1ef` | Sunken fills: segmented track, chips at rest, skeletons, pressed rows. |
| `--ink-1` | `#131715` | Primary text and icons; hero amount; expense amounts; primary-button fill (label in surface-0). |
| `--ink-2` | `#494e4b` | Secondary text: merchant meta, labels, axis titles. |
| `--ink-3` | `#686d6a` | Muted text: captions, placeholders, tick labels, transfer amounts. |
| `--line` | `#dee2e0` | Hairline dividers (1px) between rows and sections. Decorative only. |
| `--line-strong` | `#7c827e` | Boundaries that must be seen: text-field underline/border, chip outline, unchecked checkbox (>=3:1). |
| `--accent` | `#08633d` | Deep green. Links, focus ring, selected segment/chip/month, active tab, checked checkbox. Never a button fill, a chart mark or an amount. |
| `--accent-ink` | `#ffffff` | Text and icons on the rare accent-filled element (a checked checkbox). Not used by buttons. |
| `--accent-soft` | `#dff5e7` | Selection wash behind accent text (selected chip, selected month, selected category tile). |
| `--focus` | `#08633d` | Keyboard focus ring: 2px solid, 2px offset in the surface color. |
| `--income` | `#3b7b1f` | Income amounts as text, always with a + sign. Leaf green, distinct from the bottle-green accent. |
| `--expense` | `#131715` | Expense amounts (= ink-1). Spending is the normal case, so it is never red. |
| `--transfer` | `#686d6a` | Transfer amounts (= ink-3), always with the arrow-left-right glyph and no sign. |
| `--person-a` | `#2a78d6` | Person A ("Tú") on marks only: stacked-bar segment, 8px dot. Never text. = series-1. |
| `--person-b` | `#eb6834` | Person B ("{pareja}") on marks only. Never text. = series-2. |
| `--mark-neutral` | `#606562` | Single-series chart marks (spend by category, 6-month trend). Expense is ink, in charts too. |
| `--mark-muted` | `#b4b9b6` | De-emphasised marks: "Hogar/shared" segment, "Otros", previous period. Sub-3:1, so always labelled. |
| `--series-1` | `#2a78d6` | Categorical slot 1 (blue). |
| `--series-2` | `#eb6834` | Categorical slot 2 (orange). |
| `--series-3` | `#1baf7a` | Categorical slot 3 (aqua). |
| `--series-4` | `#eda100` | Categorical slot 4 (yellow). |
| `--series-5` | `#e87ba4` | Categorical slot 5 (magenta). |
| `--series-6` | `#8d792a` | Categorical slot 6 (bronze; replaces the reference green). |
| `--series-7` | `#6250d6` | Categorical slot 7 (violet). |
| `--series-8` | `#7c3b77` | Categorical slot 8 (plum; replaces the reference red). |
| `--status-good` | `#0ca30c` | Success icon (check-circle) + label. Never alone. |
| `--status-warning` | `#b37903` | Warning icon (triangle-alert) + label; "dudosa" review rows. |
| `--status-serious` | `#c0571e` | Serious icon (octagon-alert) + label; budget over 90%. |
| `--status-critical` | `#c8393a` | Errors and destructive actions only: icon, field error text, destructive button text/border. |
| `--gridline` | `#e7eae8` | Chart gridlines: 1px solid, recessive. |
| `--baseline` | `#bbbfbc` | Chart baseline/axis rule: 1px solid. |
| `--scrim` | `#13171566` | Backdrop behind bottom sheets and dialogs. |

### Dark theme

The dark theme is not an inversion. Surfaces are a green-black (`#0c0f0d` → `#151816` → `#1e2320`); the accent moves to a lighter step of the same hue so it keeps 7.5:1; person and series colours use their own dark steps, validated against `#0c0f0d`; status warning and serious move to their brighter steps, which read on dark.

| Token | Hex | Use |
|---|---|---|
| `--surface-0` | `#0c0f0d` | App/page background; chart surface. |
| `--surface-1` | `#151816` | Raised: cards, sheets, toasts, text fields, keypad keys. |
| `--surface-2` | `#1e2320` | Sunken fills: segmented track, chips at rest, skeletons, pressed rows. |
| `--ink-1` | `#ecefed` | Primary text and icons; hero amount; expense amounts; primary-button fill (label in surface-0). |
| `--ink-2` | `#bbbfbc` | Secondary text: merchant meta, labels, axis titles. |
| `--ink-3` | `#8e9490` | Muted text: captions, placeholders, tick labels, transfer amounts. |
| `--line` | `#2b2f2c` | Hairline dividers (1px) between rows and sections. Decorative only. |
| `--line-strong` | `#6b706d` | Boundaries that must be seen: text-field underline/border, chip outline, unchecked checkbox (>=3:1). |
| `--accent` | `#5abb88` | Deep green. Links, focus ring, selected segment/chip/month, active tab, checked checkbox. Never a button fill, a chart mark or an amount. |
| `--accent-ink` | `#0c0f0d` | Text and icons on the rare accent-filled element (a checked checkbox). Not used by buttons. |
| `--accent-soft` | `#162f21` | Selection wash behind accent text (selected chip, selected month, selected category tile). |
| `--focus` | `#5abb88` | Keyboard focus ring: 2px solid, 2px offset in the surface color. |
| `--income` | `#88d56c` | Income amounts as text, always with a + sign. Leaf green, distinct from the bottle-green accent. |
| `--expense` | `#ecefed` | Expense amounts (= ink-1). Spending is the normal case, so it is never red. |
| `--transfer` | `#8e9490` | Transfer amounts (= ink-3), always with the arrow-left-right glyph and no sign. |
| `--person-a` | `#3987e5` | Person A ("Tú") on marks only: stacked-bar segment, 8px dot. Never text. = series-1. |
| `--person-b` | `#d95926` | Person B ("{pareja}") on marks only. Never text. = series-2. |
| `--mark-neutral` | `#a0a6a3` | Single-series chart marks (spend by category, 6-month trend). Expense is ink, in charts too. |
| `--mark-muted` | `#444946` | De-emphasised marks: "Hogar/shared" segment, "Otros", previous period. Sub-3:1, so always labelled. |
| `--series-1` | `#3987e5` | Categorical slot 1 (blue). |
| `--series-2` | `#d95926` | Categorical slot 2 (orange). |
| `--series-3` | `#199e70` | Categorical slot 3 (aqua). |
| `--series-4` | `#c98500` | Categorical slot 4 (yellow). |
| `--series-5` | `#d55181` | Categorical slot 5 (magenta). |
| `--series-6` | `#7b6813` | Categorical slot 6 (bronze; replaces the reference green). |
| `--series-7` | `#9085e9` | Categorical slot 7 (violet). |
| `--series-8` | `#8f4d89` | Categorical slot 8 (plum; replaces the reference red). |
| `--status-good` | `#0ca30c` | Success icon (check-circle) + label. Never alone. |
| `--status-warning` | `#fab219` | Warning icon (triangle-alert) + label; "dudosa" review rows. |
| `--status-serious` | `#ec835a` | Serious icon (octagon-alert) + label; budget over 90%. |
| `--status-critical` | `#e66767` | Errors and destructive actions only: icon, field error text, destructive button text/border. |
| `--gridline` | `#1b1f1d` | Chart gridlines: 1px solid, recessive. |
| `--baseline` | `#444946` | Chart baseline/axis rule: 1px solid. |
| `--scrim` | `#0000008f` | Backdrop behind bottom sheets and dialogs. |

Material role mapping for the dark theme (for Stitch dark screens):

| Role | Hex |
|---|---|
| background | `#0c0f0d` |
| on-background | `#ecefed` |
| surface | `#0c0f0d` |
| surface-dim | `#0a0c0b` |
| surface-bright | `#2a2f2c` |
| surface-container-lowest | `#0a0c0b` |
| surface-container-low | `#121513` |
| surface-container | `#1e2320` |
| surface-container-high | `#242926` |
| surface-container-highest | `#2b2f2c` |
| surface-variant | `#1e2320` |
| on-surface | `#ecefed` |
| on-surface-variant | `#bbbfbc` |
| inverse-surface | `#ecefed` |
| inverse-on-surface | `#131715` |
| outline | `#6b706d` |
| outline-variant | `#2b2f2c` |
| surface-tint | `#ecefed` |
| primary | `#ecefed` |
| on-primary | `#0c0f0d` |
| primary-container | `#162f21` |
| on-primary-container | `#5abb88` |
| inverse-primary | `#131715` |
| secondary | `#bbbfbc` |
| on-secondary | `#131715` |
| secondary-container | `#1e2320` |
| on-secondary-container | `#ecefed` |
| tertiary | `#8e9490` |
| on-tertiary | `#131715` |
| tertiary-container | `#242926` |
| on-tertiary-container | `#ecefed` |
| error | `#e66767` |
| on-error | `#131715` |
| error-container | `#3a1717` |
| on-error-container | `#f4b8b6` |

### Validation

- `series-1..8`: adjacent pairs pass the dataviz validator in light (surface `#f8fbf9`; worst CVD ΔE 9.1, normal-vision 15.9) and dark (surface `#0c0f0d`; worst CVD ΔE 8.4, normal-vision 18.0). Slots 1–3 also pass all-pairs in both themes, which caps scatter, bubble and small-multiple charts at three hued series. Light slots 3, 4 and 5 sit below 3:1 on the light surface, so any chart using them shows direct labels or the table view.
- `person-a` / `person-b`: pass all-pairs in both themes (CVD ΔE 24.7 light, 26.8 dark) and clear 3:1 on the surface.
- Sequential neutral ramp (light `#abb3ae #8e9691 #727a75 #575e5a #3d4440`; dark `#4d5550 #686f6b #838b87 #a0a9a3 #bec7c1`): passes the ordinal checks in both themes.
- Every text and UI pair listed in the tables passes WCAG: text ≥4.5:1, icons, borders and focus ≥3:1, in both themes.
- Status colours are a severity scale, not categorical identity, so they are checked with WCAG contrast plus the icon-and-label rule. They are never placed side by side as unlabelled fills.

## Typography

One family: **Inter** (variable, v4, self-hosted, `font-display: swap`, `font-optical-sizing: auto`). Weights 400, 500 and 600 only. Fallback stack: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. No display face, no serif, no monospace in the UI.

| Style | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 44 / 48 | 500 | −0.02em | The one hero amount per view (month spend, quick-add amount). Proportional figures. Range 40–48 by viewport. |
| `title` | 24 / 32 | 600 | −0.01em | Screen titles, stat-tile values, keypad digits (at weight 500). |
| `heading` | 18 / 24 | 600 | −0.005em | Section and sheet titles, chart titles, empty-state titles. |
| `body` | 16 / 24 | 400 | 0 | Running text, merchant names in rows, field values. |
| `body-strong` | 16 / 24 | 500 | 0 | Emphasis in body, button labels. |
| `amount` | 16 / 24 | 500 | 0 | Amounts in rows, tables and totals. Always tabular figures. |
| `label` | 13 / 16 | 500 | +0.01em | Field labels, chip text, segmented options, legend items, day-group headers. |
| `eyebrow` | 12 / 16 | 600 | +0.06em | Uppercase section labels ("GASTADO EN OCTUBRE"). Use sparingly, one per section at most. |
| `caption` | 12 / 16 | 400 | +0.01em | Row metadata, helper text, axis ticks, tab labels, footnotes. |

Figures:

- **Tabular figures in every column of numbers**: list amounts, totals, table views, axis ticks, day subtotals, the keypad. CSS: `font-variant-numeric: tabular-nums`.
- **Proportional figures only for the single hero amount** and stat-tile values, with tight tracking (−0.02em). Equal-width digits look loose at display sizes.
- In the hero, the "$" and the cents may drop to `ink-2`, but stay at the same size and weight; never superscript cents.
- Amount alignment: right-aligned, on the trailing edge, so decimal points line up.
- Keep running text to about 65 characters. Headings use `text-wrap: balance`.

## Layout & Spacing

- **Grid.** 8px base with a 4px half-step for icon-to-label gaps. Spacing tokens: 4, 8, 16, 24, 32, 48.
- **Frame.** Designed at 390 × 844 (iPhone 14/15). Side gutter 16px, plus `env(safe-area-inset-*)`. On wider screens the app is a single centred column, max 480px.
- **Rows.** List rows are 56px tall. Day-group headers are 32px. Table-view rows are 44px.
- **Tap targets.** Minimum 44px, 48px for primary controls, 56px for keypad keys and the bottom primary button. A visual element smaller than its target (a 36px chip, an 8px dot) gets an invisible hit area that reaches the minimum.
- **One-handed use.** Primary actions sit at the bottom: the full-width primary button is fixed 16px above the bottom safe area; the tab bar is 64px plus the safe area.
- **Vertical rhythm.** 32px between sections on a scrolling screen, 16px between a section header and its content, 8px between related controls. Sections are separated by whitespace and, where needed, one hairline. No boxes around sections.
- **Shell.** Top app bar 56px (title left, at most two 44px icon buttons right). Bottom tab bar: Mes · Movimientos · **+** · Importar · Ajustes.

Screen skeletons the system is tuned for:

- **Quick add `/add`** (the sacred screen, 3 taps ≈ 6 s): top bar with "Listo" and a date chip → segmented Gasto / Ingreso / Transferencia → hero amount → account and "who paid" chips → 4 × 2 grid of the 8 most-used categories → collapsed "Más" row (nota, comercio, fecha) → 3 × 4 keypad → fixed "Guardar −$42.50" button. Opens with defaults: gasto, last account, "Tú", today in the household time zone.
- **Month `/month`**: month strip → eyebrow + hero spend + delta vs previous month → three stat tiles (ingreso, gasto, ahorro neto) → spend by category (horizontal bars) → 6-month trend (line) → by person (100% stacked bar) → top 5 transactions → two insight cards → tab bar. On month change the previous render stays at 60% opacity until data arrives; skeletons appear only on first load.

## Elevation & Depth

Flat by default. Depth comes from surface steps and hairlines, never from heavy shadow, gradients or blur.

| Level | Light | Dark | Used by |
|---|---|---|---|
| 0 | `surface-0` | `surface-0` | Page, charts, lists. |
| 1 | `surface-1` + 1px `line` | `surface-1` + 1px `line` | Cards, text fields, category tiles, the doubtful review row. No shadow. |
| 2 | `surface-1` + `0 1px 2px rgba(19,23,21,0.06), 0 8px 24px rgba(19,23,21,0.08)` | `surface-1` + 1px `line`, no shadow | Bottom sheets, toasts, chart tooltips: the only floating things. |

- Bottom sheets and dialogs sit over `scrim` (light `#13171566`, dark `#0000008f`). No backdrop blur, no glass.
- Nothing is ever more than one step above what is behind it. No cards inside cards.

## Shapes

| Token | Value | Use |
|---|---|---|
| `rounded.sm` | 4px | Bar data-ends, badges, skeleton blocks, checkboxes, the segmented-control thumb. |
| `rounded.DEFAULT` / `md` | 8px | Buttons, text fields, chips, segmented control and its thumb, keypad keys, category icon squares. |
| `rounded.lg` | 12px | Cards, category tiles, toasts, banners, the central add button, empty-state icon square. |
| `rounded.xl` | 16px | Top corners of bottom sheets only. |
| `rounded.full` | 9999px | Only for 8px person dots, avatars, the sheet drag handle and progress-track ends. |

No pill buttons and no pill chips. Icons are Lucide at 20px with a 1.75px stroke (24px only in the empty state and the add button), `stroke-linecap: round`, coloured with `currentColor` from an ink or status token. No emoji as icons, no decorative illustrations, no mascots.

## Motion

Motion is restrained and functional. Only three things move:

| What | Duration | Easing | Behaviour |
|---|---|---|---|
| Bottom sheet enter / exit | 200ms / 150ms | `cubic-bezier(0.2, 0, 0, 1)` (ease-out) | Translates up from the bottom edge; scrim fades in. |
| Toast | 150ms | ease-out | Fades in while rising 8px; leaves by fading. Auto-dismiss after 5s (8s when it has "Deshacer"). |
| Segment change (segmented control, month strip) | 150ms | ease-out | The thumb or selection wash slides to the new option. |

- Everything else changes instantly: no page transitions, no number count-ups, no chart grow-in, no parallax, no hover lifts.
- `prefers-reduced-motion: reduce`: sheets and toasts appear without translation (opacity only, 100ms), segment thumbs jump.
- Saving a transaction gives a short haptic pulse (`navigator.vibrate(10)` where supported) and a toast. Never confetti or celebration.

## Components

Every component styles itself through the tokens above, supports both themes, and has a visible focus state: `outline: 2px solid var(--focus); outline-offset: 2px`, following the shape's radius.

### Button

- **Primary**: `ink-1` fill (ink-black on light, ink-white on dark) with the label in `surface-0`, `body-strong`, radius 8. Never the accent. Height 56 when full-width at the bottom of a screen, 48 inline. At most one per view. The label carries the outcome when it helps: "Guardar −$42.50".
- **Secondary**: `surface-1` fill, 1px `line-strong` border, `ink-1` label. Height 48.
- **Ghost**: no fill or border, `ink-1` label (`accent` when it is a link-style action such as "Deshacer" or "Ver todo"). Height 44.
- **Destructive**: `surface-1` fill, 1px `status-critical` border, `status-critical` label, `trash-2` icon. Never a red fill. Final confirmation for irreversible actions ("Eliminar hogar") happens in a sheet that asks the user to type the household name.
- **Icon button**: 44 × 44, 20px icon in `ink-1`, no fill; pressed state `surface-2`.
- States: pressed moves the primary fill to `ink-2` or uses `surface-2` (others); disabled uses `surface-2` fill and `ink-3` label with no border; loading keeps the label and width and swaps the leading icon for a 16px spinner.

### Text field

- Label above in `label` / `ink-2`, 8px gap. Field 48px tall, `surface-1` fill, 1px `line-strong` border, radius 8, value in `body` / `ink-1`, placeholder in `ink-3`, 16px horizontal padding.
- Focus: border becomes 2px `accent` (no glow). Error: 2px `status-critical` border, then a `circle-alert` icon and the message in `label` / `status-critical` below. Helper text in `caption` / `ink-3`.
- Money is never typed into a text field: amounts come only from the amount keypad.

### Amount display

- Hero: `display` style, proportional figures, `ink-1`; cents may drop to `ink-2` at the same size. On Month the hero is the period total and carries no sign. In quick add it shows the unsigned amount being typed; the segment states the type and the save button repeats it with its sign ("Guardar −$42.50").
- Row amount: `amount` style, tabular figures, right-aligned. Expense `expense` "−$84.20"; income `income` "+$3,200.00"; transfer `transfer` with a 16px `arrow-left-right` icon, "$500.00".

### Amount keypad

- 3 × 4 grid: 1 2 3 / 4 5 6 / 7 8 9 / 00 0 ⌫ (`delete` icon). Keys are 56px tall, full gutter width, separated by 1px `line` hairlines like a printed form, no key borders.
- Digits in `title` at weight 500, tabular, `ink-1`. Pressed key: `surface-2`. Long-press ⌫ clears.
- Entry shifts in from the cents: 4 → $0.04, 4 2 → $0.42, 4 2 5 0 → $42.50. "00" appends two zeros for whole dollars. Value is integer cents. Max $999,999.99.
- Announces the formatted amount to screen readers after each key ("42 dólares con 50").

### Segmented control

- Track: `surface-2`, radius 8, 44px tall, 4px inset. Thumb: `surface-1` with 1px `line`, radius 4 (concentric with the 8px track at the 4px inset).
- Options in `label`. Selected: `accent` text at weight 600 on the thumb. Unselected: `ink-2`. Two to four options, equal widths.
- The thumb slides 150ms. Quick add uses Gasto / Ingreso / Transferencia; import review uses Todas / Dudosas / Nuevas.

### Chip

- 36px visual height (44px hit area), radius 8, 12px horizontal padding, `label` text.
- Filter chip at rest: `surface-1`, 1px `line-strong`, `ink-1` text, optional trailing `chevron-down` 16px. Selected: `accent-soft` fill, 1px `accent` border, `accent` text, leading `check` 16px.
- Value chip (quick add account, who paid, date): same shape, shows "NAB Everyday ▾"; opens a select sheet.
- A person chip shows the 8px person dot before the word ("● Tú").

### List row (transaction)

- 56px tall, 16px side padding. Leading: 36px `surface-2` square, radius 8, with the category's 20px Lucide icon in `ink-1`.
- Middle: merchant in `body` / `ink-1` (single line, ellipsis); below it `caption` / `ink-3`: category · account, with an 8px person dot (`person-a` / `person-b`; hollow `mark-muted` ring for shared).
- Trailing: amount (see Amount display). Divider: 1px `line`, inset 68px from the leading edge.
- Pressed: `surface-2`. Long-press opens the action sheet (Editar, Duplicar, Eliminar). A private transaction shows "Privado" in place of merchant and category for the other member.
- **Day-group header**: 32px, `label` / `ink-2` "Hoy · mar 14 oct" left, day subtotal in `amount` tabular / `ink-3` right; sticky under the top bar.

### Card

- `surface-1`, 1px `line`, radius 12, 16px padding. No shadow. Never nested inside another card, and charts on the Month view are not wrapped in cards.
- Used for insight cards, the install-app card and settings groups. An insight card has an `eyebrow` ("OBSERVACIÓN"), one or two sentences in `body`, and an optional ghost action.

### Bottom sheet

- `surface-1`, top corners 16px, level-2 elevation over `scrim`. 32 × 4 drag handle in `line-strong` centred 8px from the top. Title in `heading`, 16px padding, optional ghost close action on the right.
- Max height 90% of the viewport; content scrolls inside. Primary action, if any, is fixed at the bottom of the sheet.
- **Select sheet**: a sheet of 56px rows with a trailing `check` in `accent` on the selected row, plus a search field when there are more than 8 options.

### Month picker

- A horizontal strip of month labels ("jun jul ago sep oct nov") in `label` / `ink-2`, 44px tall, scrolled so the selected month sits at the right edge, swipeable.
- Selected month: `accent-soft` fill, radius 8, `accent` text at 600, with the year shown when it differs from the current year ("dic 2025"). Future months are `ink-3` and not selectable.
- Tapping the selected month opens a sheet with a year grid of months.

### Stat tile

- Label in `caption` / `ink-2` (sentence case, no colon), value in `title` with proportional figures / `ink-1`, optional delta line in `caption` / `ink-2` with a 16px `arrow-up-right` or `arrow-down-right` icon. The icon takes `status-good` when the change is favourable and `status-serious` when it is not; the words carry the meaning ("8% menos que sep").
- On Month, three tiles sit in one row separated by 1px vertical `line` hairlines, with no boxes.

### Review row (import and receipt review)

A transaction row with a 44px leading checkbox, used by `ReviewList` / `RowTriage` / `BulkBar`. Three states, each shown by icon shape plus a word, never colour alone:

- **Automática** (`auto`): `circle-check` in `status-good` + "Auto"; category shown as a plain value; row at rest.
- **Dudosa** (`doubtful`): `triangle-alert` in `status-warning` + "Revisar"; the suggested category is a value chip ("Súper ?") with "Aceptar" and "Cambiar" ghost actions; row background `surface-1` with a 1px `line` border to make it stand out from the list.
- **Nueva** (`new`): `circle-plus` in `ink-2` + "Nueva"; category chip reads "Sin categoría" with a `line-strong` border.
- Duplicates are hidden by default behind a "Duplicadas (D)" filter and render in `ink-3` with a `copy` icon.
- **Bulk bar**: fixed at the bottom, `surface-1` level 2, shows "N seleccionadas" and the primary "Aceptar sugeridas (M)" plus a secondary "Asignar categoría".

### Empty state

- Centred in the content area: a 48px `surface-2` square, radius 12, with a 24px Lucide icon in `ink-3`; title in `heading` / `ink-1`; one sentence in `body` / `ink-2`; one action (primary when it is the screen's main job, otherwise secondary).
- Copy states the fact and the next step: "Aún no hay movimientos en octubre." / "Agrega el primero o importa el CSV de tu banco." Never jokes, never illustrations.

### Toast

- Bottom, 16px above the tab bar or the primary button, 16px side margins; on screens with a bottom keypad (quick add) it docks under the top bar instead. `surface-1`, 1px `line`, level 2, radius 12, 48px min height, 16px padding. Announced with `role="status"`.
- Message in `body` / `ink-1`, optional leading status icon, optional trailing ghost action in `accent` ("Deshacer"). One toast at a time; a new one replaces the old.

### Banner

- Inline at the top of the content it concerns, full width within the gutters. `surface-2`, radius 12, 16px padding, no border and no coloured side stripe.
- Leading 20px icon (`info` in `ink-2`, or a status icon in its status colour), message in `body` / `ink-1`, optional ghost action in `accent` ("Actualizar"). Dismissible with a 44px `x` icon button.
- Used for: new app version, offline, import finished with warnings, budget past 90%.

### Progress

- **Linear**: 4px track in `surface-2` with fully rounded ends; fill in `ink-1` for task progress (CSV upload). Percentage or "1.2 MB de 3.4 MB" in `caption` tabular / `ink-2` beside it. Indeterminate state: a 30% segment that slides, or static under reduced motion.
- **Meter** (budgets, later): fill in `mark-neutral`; past 90% the fill takes `status-serious` and past 100% `status-critical`, each with icon and label ("92% usado", "Excedido por $48.10").
- **Steps** (onboarding): "Paso 2 de 4" in `caption` plus four 4px segments, completed ones in `ink-1`.

### Tab bar

- Fixed bottom, `surface-1`, 1px `line` top border, 64px plus the bottom safe area. Five equal slots: Mes (`calendar`), Movimientos (`list`), **+**, Importar (`file-up`), Ajustes (`settings`).
- Each tab: 20px icon over a `caption` label. Inactive `ink-3`; active `accent` icon and label at weight 600.
- Centre add button: 48 × 48, radius 12, `ink-1` fill, 24px `plus` in `surface-0` (it is a primary action, so it follows the primary button), sitting inside the bar (not floating, no notch). Accessible name "Agregar movimiento". Opens `/add`.

### Category tile (quick add grid)

- 4 × 2 grid with 8px gaps, tiles 64px tall, radius 12, `surface-1` with 1px `line`. 20px Lucide icon in `ink-1` over the name in `caption` / `ink-2` (one line, ellipsis).
- Selected: `accent-soft` fill, 1px `accent` border, icon and name in `accent`.
- The eighth tile is always "Más" (`ellipsis`), which opens the category select sheet.

### Badge

- 20px tall, radius 4, 6px padding, `caption` at 500. Neutral: `surface-2` / `ink-2`. Status badges add a 12px status icon; the text stays `ink-1`.

### Skeleton

- `surface-2` blocks at the size of the content they stand for, radius 4. A gentle opacity pulse (1.2s) or static under reduced motion. Only on first load; refetches keep the previous render at 60% opacity.

### Chart frame

- Wraps every chart: title in `heading`, optional subtitle in `caption` / `ink-3`, a 44px icon button on the right that toggles between chart (`chart-bar`) and table (`table-2`) views, the legend row (2+ series), the plot, and an optional footnote in `caption` / `ink-3`.
- The table view uses the same frame: 44px rows, labels left, values right in tabular `amount`, a total row with a 1px `line-strong` top rule.
- Tooltips: `surface-1`, level 2, radius 8, `label` text in ink with the series key as an 8px dot.

## Charts

Charts are drawn in SVG from the same tokens as the UI. The rules below are non-negotiable.

**Marks**

- Bars and columns: at most 24px thick (the Month view's category bars are 12px); 4px rounded data-end, square at the baseline; grow from one baseline.
- 2px surface-coloured gaps between stacked segments and between touching bars. Never outline a mark to separate it.
- Lines: 2px, round joins and caps. Markers: at least 8px diameter, filled with the series colour, with a 2px ring in the surface colour.
- Area fills: the series colour at about 10% opacity, never a saturated block.
- Gridlines: 1px solid `gridline`, horizontal only. Baseline: 1px solid `baseline`. Never dashed.

**Colour**

- One series uses `mark-neutral` and needs no legend; the title names it. Spending by category and the 6-month trend are single-series charts.
- People: `person-a`, `person-b`, and `mark-muted` for "Hogar/compartido". A chart encodes either people or categories by hue, never both, and a screen with a person chart keeps its category charts single-series.
- Multi-series categorical charts use `series-1..8` in fixed order, assigned by entity and never by rank, so a filter never repaints survivors. Cap at six hued series plus "Otros" in `mark-muted`; scatter, bubble and small multiples cap at three.
- `series-1` and `series-2` are the same hues as `person-a` and `person-b`, which is why the two encodings never share a screen.
- Sequential magnitude (heatmaps, later) uses the neutral ramp listed under Colors. No rainbow scales, no hue at a diverging midpoint.
- The accent is never a bar or line colour. Status colours appear in a chart only when the mark means good or bad (a budget meter), always with icon and label.

**Text and structure**

- One value axis. Never dual axes; two measures of different scale become two charts.
- Axis ticks round to clean values and compact from 1,000 ("$0", "$2k", "$4k"), in `caption` tabular / `ink-3`.
- Legend for two or more series, placed above the plot, each item an 8px dot or 12px line key plus its label in ink. Direct labels are selective: the endpoint, the extreme, or the series the story is about.
- Text is never set in a series colour. Labels inside a coloured segment use white or `ink-1`, chosen by the fill's luminance, and appear only when they fit with padding.
- Every chart has a table view. Tooltips enhance and never gate a value.
- No donut or pie charts, no 3D, no dual-axis, no gradients, no animated grow-in.

**Interaction**

- Tap or hover on a bar shows its tooltip; a line chart shows a vertical crosshair and the nearest point's value. Hit areas cover the whole band, at least 44px.
- Filters live in one row above the charts they scope (the month strip on Month). No filters inside a chart frame.

**The Month-view charts**

- **Gasto por categoría**: horizontal bars, 12px thick, one row per category group (name left in `label`, amount right in tabular `amount`, bar beneath), sorted by amount, `mark-neutral`; "Otros" in `mark-muted`. Tapping a row expands its subcategories.
- **Tendencia · 6 meses**: single 2px line in `mark-neutral`, ringed markers on each month, the current month's value labelled at the end, y ticks at $0 / $2k / $4k / $6k.
- **Quién pagó**: one 100%-stacked horizontal bar, 24px thick, segments `person-a` | `person-b` | `mark-muted` with 2px surface gaps, legend below with dot, name, amount and percentage.

## Do's and Don'ts

**Do**

- Lead every view with one hero number, set in `display` with proportional figures.
- Use tabular figures in every column of amounts, totals and axis ticks.
- Keep expenses in ink, prefix income with "+" in `income`, and give transfers the arrow glyph.
- Use the accent only for links, focus, selected segments, chips and months, the active tab and the selection wash. Primary buttons are ink.
- Separate content with whitespace and 1px `line` hairlines.
- Give every chart a table view and every status an icon plus a word.
- Write copy in both es-MX and en-AU, day-first dates, "$" with two decimals and a true minus sign.
- Refer to people as "Tú" and "{pareja}" ("You" and "{partner}") and colour them only on marks.
- Design the dark theme with its own steps and check it with the same contrast rules.

**Don't**

- No gradients, glassmorphism, backdrop blur, glows or neon, anywhere.
- No purple or indigo as a UI colour, no second accent, and no accent-filled buttons.
- No red for spending. Red is only `status-critical`: errors and destructive actions.
- No emoji as icons, no decorative illustrations, no mascots, no mixed icon sets.
- No shadows beyond level 2, and no cards inside cards.
- No pill-shaped buttons or chips, no radii outside 4 / 8 / 12 / 16.
- No donut, pie, 3D or dual-axis charts; no dashed gridlines; no number on every data point.
- No text in a series or person colour; no accent-coloured bars.
- No motion beyond sheets, toasts and segment changes; no count-up numbers.
- No free-text amount input; amounts come from the keypad.
- No real names in mocks or copy; no "Hola, Miguel"-style greetings.
