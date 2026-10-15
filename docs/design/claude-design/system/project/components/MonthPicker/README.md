# MonthPicker

A horizontal strip of month labels in `label` / `ink-2`, 44px tall, swipeable, with the selected month at the right edge. Selected: `accent-soft` wash, radius 8, `accent` text at 600. Future months are `ink-3` and disabled. Show the year when it differs from the current one ("dic 2025"). Tapping the selected month opens a year sheet.

Changing month keeps the previous render at 60% opacity until data arrives; skeletons only on first load.
