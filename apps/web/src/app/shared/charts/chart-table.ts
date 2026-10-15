import type { Signal } from '@angular/core'

/** One column of a chart's table view; the first column holds the row labels. */
export interface ChartTableColumn {
  label: string
  /** Right-aligned tabular figures. */
  numeric: boolean
}

export interface ChartTableRow {
  label: string
  /** Formatted cells, one per column after the label column. */
  cells: readonly string[]
  /** 1 for a child row (a subcategory under its group). */
  depth?: 0 | 1
}

/**
 * The accessible twin of a chart (DESIGN.md, Chart frame; dataviz: every
 * chart has a table view): the same numbers, formatted the same way.
 */
export interface ChartTable {
  columns: readonly ChartTableColumn[]
  rows: readonly ChartTableRow[]
  total: ChartTableRow | null
}

export const EMPTY_CHART_TABLE: ChartTable = { columns: [], rows: [], total: null }

/**
 * Implemented by every chart and provided under this token, so the chart
 * frame reads the table from the very chart it wraps instead of the page
 * building a second copy of the data.
 */
export abstract class ChartTableSource {
  abstract readonly table: Signal<ChartTable>
}
