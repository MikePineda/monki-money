# monkimoney design system (WP 0.2)

Deliverables for work package 0.2. `DESIGN.md` is in the Stitch format (YAML front matter with `name`, `colors`, `typography`, `rounded`, `spacing`, then the ten sections) and is meant to move to `docs/design/DESIGN.md` in the repo.

## Artifacts (Claude Design, private)

| Artifact | Type | URL |
|---|---|---|
| monkimoney design system | Design System | https://claude.ai/artifact/<artifact> |
| monkimoney — Month view (light + dark artboards) | Design | https://claude.ai/artifact/<artifact> |
| monkimoney — Quick add (light + dark artboards) | Design | https://claude.ai/artifact/<artifact> |

All three are private until shared from each page's Share menu. Both Design canvases have the design system installed (`project/ds/monkimoney/`: tokens.json, tokens.css, components/bundle.css), so their Theme menu offers the real tokens. Their source files are in `claude-design/` next to this README (`system/`, `month/`, `quickadd/`); they are the published content, not app code.

## Files here

- `DESIGN.md`: the full specification for Stitch and for implementation (tokens for both themes, type, layout, elevation, shapes, motion, 20+ components, chart rules, do's and don'ts).
- `claude-design/system/project/`: the design system as published (`tokens.json`, `tokens.css`, `components/bundle.css`, 19 component guidelines + previews, cover, brand book).
- `claude-design/month/project/`, `claude-design/quickadd/project/`: the two canvases.

## Token summary

Semantic tokens map one-to-one to the CSS custom properties planned for `styles.css` (`[data-theme]` on `<html>`). Extras beyond the plan's list, each with a reason: `accent-soft` (selection wash), `line-strong` (boundaries that must hit 3:1), `mark-neutral` / `mark-muted` (single-series and de-emphasised chart marks), `scrim` (sheet backdrop).

| Semantic token | Light | Dark |
|---|---|---|
| `--surface-0` | `#f8fbf9` | `#0c0f0d` |
| `--surface-1` | `#ffffff` | `#151816` |
| `--surface-2` | `#edf1ef` | `#1e2320` |
| `--ink-1` | `#131715` | `#ecefed` |
| `--ink-2` | `#494e4b` | `#bbbfbc` |
| `--ink-3` | `#686d6a` | `#8e9490` |
| `--line` | `#dee2e0` | `#2b2f2c` |
| `--line-strong` | `#7c827e` | `#6b706d` |
| `--accent` | `#08633d` | `#5abb88` |
| `--accent-ink` | `#ffffff` | `#0c0f0d` |
| `--accent-soft` | `#dff5e7` | `#162f21` |
| `--focus` | `#08633d` | `#5abb88` |
| `--income` | `#3b7b1f` | `#88d56c` |
| `--expense` | `#131715` | `#ecefed` |
| `--transfer` | `#686d6a` | `#8e9490` |
| `--person-a` | `#2a78d6` | `#3987e5` |
| `--person-b` | `#eb6834` | `#d95926` |
| `--mark-neutral` | `#606562` | `#a0a6a3` |
| `--mark-muted` | `#b4b9b6` | `#444946` |
| `--series-1` | `#2a78d6` | `#3987e5` |
| `--series-2` | `#eb6834` | `#d95926` |
| `--series-3` | `#1baf7a` | `#199e70` |
| `--series-4` | `#eda100` | `#c98500` |
| `--series-5` | `#e87ba4` | `#d55181` |
| `--series-6` | `#8d792a` | `#7b6813` |
| `--series-7` | `#6250d6` | `#9085e9` |
| `--series-8` | `#7c3b77` | `#8f4d89` |
| `--status-good` | `#0ca30c` | `#0ca30c` |
| `--status-warning` | `#b37903` | `#fab219` |
| `--status-serious` | `#c0571e` | `#ec835a` |
| `--status-critical` | `#c8393a` | `#e66767` |
| `--gridline` | `#e7eae8` | `#1b1f1d` |
| `--baseline` | `#bbbfbc` | `#444946` |
| `--scrim` | `#13171566` | `#0000008f` |

Type: Inter variable, 400/500/600. `display` 44/48 (hero, proportional), `title` 24/32, `heading` 18/24, `body` 16/24, `amount` 16/24 (tabular), `label` 13/16, `eyebrow` 12/16 uppercase, `caption` 12/16. Radii 4 / 8 / 12, sheets 16. Spacing 4 / 8 / 16 / 24 / 32 / 48, rows 56, tap targets 44–56.

## Palette validation

Validator: `dataviz/scripts/validate_palette.js` (bundled skill), run per theme against the page surface (`#f8fbf9` light, `#0c0f0d` dark). Every run exits 0.

- `series-1..8`, adjacent: PASS in light (worst CVD ΔE 9.1, normal-vision 15.9) and dark (8.4, 18.0). Light slots 3–5 are below 3:1 on the surface (WARN, relief = direct labels or table view, which the chart rules require anyway).
- `series-1..3`, all pairs: PASS in both themes (caps scatter and small multiples at three hued series).
- `person-a`, `person-b`: PASS all pairs in both themes (CVD ΔE 24.7 light, 26.8 dark), both ≥3:1.
- Neutral sequential ramp (`--ordinal`): PASS in both themes.
- WCAG for every single-colour token on its surfaces (text ≥4.5:1, icons, borders and focus ≥3:1): all pass in both themes.
- Status colours are a severity scale, not series identity, so the categorical validator does not apply (the skill scopes it out). For the record, the dataviz reference status set also fails it (exit 1), and a search for four status steps that pass it only found off-meaning colours (a brown warning, a pink critical). Status is covered by WCAG contrast plus the icon-and-label rule instead.

<details>
<summary>Full validator output</summary>

```
### series-1..8 adjacent — light
$ node validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#8d792a,#6250d6,#7c3b77" --mode light --surface #f8fbf9
Palette (light, surface #f8fbf9, categorical): 8 slots
  [PASS] Lightness band         all 8 inside L 0.43–0.77
  [PASS] Chroma floor           all 8 >= 0.1
  [PASS] CVD separation         worst adjacent #eda100↔#1baf7a ΔE 9.1 (protan) · tritan 5.8
  [PASS] Normal-vision floor    worst adjacent #7c3b77↔#6250d6 ΔE 15.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#1baf7a",2.7],["#eda100",2.08],["#e87ba4",2.58]]

  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)
  scope: categorical palettes only. For a lone status/text color check WCAG text contrast; for a sequential ramp, lightness monotonicity.
(exit 0)

### series-1..3 all-pairs (scatter/small-multiples cap) — light
$ node validate_palette.js "#2a78d6,#eb6834,#1baf7a" --mode light --surface #f8fbf9 --pairs all
Palette (light, surface #f8fbf9, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst all-pairs #1baf7a↔#eb6834 ΔE 9.2 (deutan) · tritan 9.6
  [PASS] Normal-vision floor    worst all-pairs #1baf7a↔#2a78d6 ΔE 24.0 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#1baf7a",2.7]]

  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)
  scope: categorical palettes only. For a lone status/text color check WCAG text contrast; for a sequential ramp, lightness monotonicity.
(exit 0)

### person-a, person-b — light
$ node validate_palette.js "#2a78d6,#eb6834" --mode light --surface #f8fbf9 --pairs all
Palette (light, surface #f8fbf9, categorical): 2 slots
  [PASS] Lightness band         all 2 inside L 0.43–0.77
  [PASS] Chroma floor           all 2 >= 0.1
  [PASS] CVD separation         worst all-pairs #eb6834↔#2a78d6 ΔE 24.7 (protan) · tritan 32.7
  [PASS] Normal-vision floor    worst all-pairs #eb6834↔#2a78d6 ΔE 33.6 (normal)
  [PASS] Contrast vs surface    all 2 >= 3:1

  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)
  scope: categorical palettes only. For a lone status/text color check WCAG text contrast; for a sequential ramp, lightness monotonicity.
(exit 0)

### sequential neutral ramp (ordinal) — light
$ node validate_palette.js "#abb3ae,#8e9691,#727a75,#575e5a,#3d4440" --mode light --surface #f8fbf9 --ordinal
Palette (light, surface #f8fbf9, ordinal ramp): 5 slots
  [PASS] Lightness monotone     steps read light→dark
  [PASS] Adjacent ΔL            all gaps >= 0.06
  [PASS] Light-end contrast     #abb3ae at 2.06:1 vs surface
  [PASS] Single hue             hue spread 2°

  → ALL CHECKS PASS  (ordinal: one hue, monotone L, visible step gaps, light end clears surface)
(exit 0)

### series-1..8 adjacent — dark
$ node validate_palette.js "#3987e5,#d95926,#199e70,#c98500,#d55181,#7b6813,#9085e9,#8f4d89" --mode dark --surface #0c0f0d
Palette (dark, surface #0c0f0d, categorical): 8 slots
  [PASS] Lightness band         all 8 inside L 0.48–0.67
  [PASS] Chroma floor           all 8 >= 0.1
  [PASS] CVD separation         worst adjacent #c98500↔#199e70 ΔE 8.4 (protan) · tritan 8.7
  [PASS] Normal-vision floor    worst adjacent #8f4d89↔#9085e9 ΔE 18.0 (normal)
  [PASS] Contrast vs surface    all 8 >= 3:1

  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)
  scope: categorical palettes only. For a lone status/text color check WCAG text contrast; for a sequential ramp, lightness monotonicity.
(exit 0)

### series-1..3 all-pairs (scatter/small-multiples cap) — dark
$ node validate_palette.js "#3987e5,#d95926,#199e70" --mode dark --surface #0c0f0d --pairs all
Palette (dark, surface #0c0f0d, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.48–0.67
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst all-pairs #199e70↔#d95926 ΔE 9.4 (deutan) · tritan 4.0
  [PASS] Normal-vision floor    worst all-pairs #199e70↔#3987e5 ΔE 20.9 (normal)
  [PASS] Contrast vs surface    all 3 >= 3:1

  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)
  scope: categorical palettes only. For a lone status/text color check WCAG text contrast; for a sequential ramp, lightness monotonicity.
(exit 0)

### person-a, person-b — dark
$ node validate_palette.js "#3987e5,#d95926" --mode dark --surface #0c0f0d --pairs all
Palette (dark, surface #0c0f0d, categorical): 2 slots
  [PASS] Lightness band         all 2 inside L 0.48–0.67
  [PASS] Chroma floor           all 2 >= 0.1
  [PASS] CVD separation         worst all-pairs #d95926↔#3987e5 ΔE 26.8 (protan) · tritan 32.4
  [PASS] Normal-vision floor    worst all-pairs #d95926↔#3987e5 ΔE 31.8 (normal)
  [PASS] Contrast vs surface    all 2 >= 3:1

  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)
  scope: categorical palettes only. For a lone status/text color check WCAG text contrast; for a sequential ramp, lightness monotonicity.
(exit 0)

### sequential neutral ramp (ordinal) — dark
$ node validate_palette.js "#4d5550,#686f6b,#838b87,#a0a9a3,#bec7c1" --mode dark --surface #0c0f0d --ordinal
Palette (dark, surface #0c0f0d, ordinal ramp): 5 slots
  [PASS] Lightness monotone     steps read light→dark
  [PASS] Adjacent ΔL            all gaps >= 0.06
  [PASS] Light-end contrast     #4d5550 at 2.51:1 vs surface
  [PASS] Single hue             hue spread 8°

  → ALL CHECKS PASS  (ordinal: one hue, monotone L, visible step gaps, light end clears surface)
(exit 0)

### WCAG contrast of semantic colors (target in brackets)
pair | light | dark
ink-1 on surface-0 [4.5] | 17.36 | 16.64
ink-1 on surface-1 [4.5] | 18.09 | 15.45
ink-1 on surface-2 [4.5] | 15.87 | 13.78
ink-2 on surface-0 [4.5] | 8.15 | 10.36
ink-2 on surface-1 [4.5] | 8.49 | 9.62
ink-2 on surface-2 [4.5] | 7.45 | 8.58
ink-3 on surface-0 [4.5] | 5.06 | 6.23
ink-3 on surface-1 [4.5] | 5.27 | 5.78
ink-3 on surface-2 [4.5] | 4.63 | 5.16
accent on surface-0 [4.5] | 7.04 | 8.17
accent on surface-1 [4.5] | 7.34 | 7.58
accent on accent-soft [4.5] | 6.41 | 6.08
accent-ink on accent [4.5] | 7.34 | 8.17
surface-0 on ink-1 (primary button) [4.5] | 17.36 | 16.64
focus on surface-0 [3] | 7.04 | 8.17
focus on surface-1 [3] | 7.34 | 7.58
income on surface-0 [4.5] | 4.99 | 10.81
income on surface-1 [4.5] | 5.20 | 10.03
transfer on surface-0 [4.5] | 5.06 | 6.23
transfer on surface-1 [4.5] | 5.27 | 5.78
status-critical on surface-0 [4.5] | 4.91 | 5.97
status-critical on surface-1 [4.5] | 5.12 | 5.54
status-good on surface-1 [3] | 3.35 | 5.33
status-warning on surface-1 [3] | 3.71 | 9.75
status-serious on surface-1 [3] | 4.54 | 6.78
status-critical on surface-2 [3] | 4.49 | 4.94
line-strong on surface-0 [3] | 3.77 | 3.82
line-strong on surface-1 [3] | 3.92 | 3.55
mark-neutral on surface-0 [3] | 5.70 | 7.78
person-a on surface-0 [3] | 4.24 | 5.30
person-b on surface-0 [3] | 3.07 | 4.96
ALL SEMANTIC CONTRAST CHECKS PASS
```

</details>

## Rationale and open questions

1. **Accent.** Deep bottle green `#08633d` (7.0:1 on the light page) with a dark step `#5abb88` (8.2:1 on the dark page) and dark text on it in dark mode (`accent-ink`).
2. **Primary buttons are ink**, as in the plan's original brief: `ink-1` fill with a `surface-0` label (ink-black on light, ink-white on dark; 17.4:1 and 16.6:1), pressed `ink-2`. The tab bar's add button follows them. The accent is reserved for links, focus, selected segment/chip/month, the active tab and the `accent-soft` wash; `accent-ink` remains only for text on the rare accent-filled element (a checked checkbox).
3. **Income is a separate leaf green** (`#3b7b1f` / `#88d56c`, ΔE ≈ 10 from the accent). The roles never overlap: the accent never colours an amount and income never colours a control. If two greens feel like too much, the fallback is income in `ink-1` with only the "+" sign.
4. **Series palette.** I started from the dataviz reference and replaced two slots: green (slot 6, collides with income/accent/good) became bronze `#8d792a`, and red (slot 8, reserved for errors) became plum `#7c3b77`. `person-a` and `person-b` equal `series-1` and `series-2`, so a screen never shows a person chart next to a category-hued chart.
5. **Single-series charts are neutral ink** (`mark-neutral`), not `series-1` blue as the dataviz default suggests. Blue means person A here, and "expense is ink" now holds in charts as well.
6. **Status steps differ per theme.** In light, warning and serious are darkened (`#b37903`, `#c0571e`) so icons clear 3:1 on light surfaces; dark keeps the reference steps.
7. **The Stitch front matter carries the light theme only** (Material roles plus the semantic extras as extra colour keys); dark values live in the Colors tables and the Material dark mapping. Open for WP 0.3: if `upload_design_md` rejects the extra colour keys, remove them from the front matter. They are duplicated in the tables.
8. **Quick add**: the hero is unsigned while typing, toasts dock under the top bar because the keypad owns the bottom, and the 8th category tile is always "Más". Stat tiles round to whole dollars; the hero and tables keep cents.
9. **Lucide stroke** is set as Lucide's `stroke-width: 1.75` (≈1.46px rendered at 20px). If a literal 1.75px line is wanted, use `absoluteStrokeWidth`.
