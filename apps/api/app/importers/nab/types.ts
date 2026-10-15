/**
 * The NAB transactions export, as observed: ten columns, the fourth one
 * unnamed and empty, newest row first, CRLF line endings, dates such as
 * `27 Sept 26`, amounts such as `-.50`, and an empty `Processed On` while a
 * row is still pending.
 */

/** Header cells in order, as NAB writes them. */
export const NAB_HEADER_CELLS = [
  'Date',
  'Amount',
  'Account Number',
  '',
  'Transaction Type',
  'Transaction Details',
  'Balance',
  'Category',
  'Merchant Name',
  'Processed On',
] as const

/** Keys of `ParsedRow.raw`, in column order. */
export const NAB_RAW_KEYS = [
  'date',
  'amount',
  'accountNumber',
  'unnamed',
  'transactionType',
  'transactionDetails',
  'balance',
  'category',
  'merchantName',
  'processedOn',
] as const

export type NabRawKey = (typeof NAB_RAW_KEYS)[number]

/** One NAB data row, cell by cell, before any interpretation. */
export type NabRawRow = Readonly<Record<NabRawKey, string>>
