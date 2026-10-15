/**
 * Synthetic sample data for the charts gallery: one Brisbane household,
 * October 2026, in AUD cents. Labels are catalogue keys relative to the kit
 * scope (translated by the page); merchant names are data, not copy.
 */
import type { MonthValue } from '../../domain/charts/projection'

export interface SampleCategory {
  id: string
  key: string
  valueCents: number
  other?: boolean
  children?: readonly { id: string; key: string; valueCents: number }[]
}

/** Spending by category group; the total is the month's $3,284.50. */
export const SPENDING_BY_CATEGORY: readonly SampleCategory[] = [
  { id: 'housing', key: 'charts.cat.housing', valueCents: 162_000 },
  {
    id: 'food',
    key: 'charts.cat.food',
    valueCents: 84_230,
    children: [
      { id: 'groceries', key: 'data.groceries', valueCents: 61_240 },
      { id: 'eating-out', key: 'data.eatingOut', valueCents: 18_640 },
      { id: 'coffee', key: 'data.coffee', valueCents: 4_350 },
    ],
  },
  {
    id: 'transport',
    key: 'data.transport',
    valueCents: 21_460,
    children: [
      { id: 'public-transport', key: 'charts.cat.publicTransport', valueCents: 14_820 },
      { id: 'fuel', key: 'charts.cat.fuel', valueCents: 6_640 },
    ],
  },
  { id: 'leisure', key: 'charts.cat.leisure', valueCents: 18_840 },
  { id: 'health', key: 'data.health', valueCents: 14_200 },
  { id: 'other', key: 'data.other', valueCents: 27_720, other: true },
]

/** Merchants are proper names, so they are data rather than catalogue copy. */
export const TOP_MERCHANTS: readonly { label: string; valueCents: number }[] = [
  { label: 'Riverside Grocer', valueCents: 41_230 },
  { label: 'Hillcrest Market', valueCents: 20_010 },
  { label: 'Translink', valueCents: 14_820 },
  { label: 'Corner Fuel', valueCents: 6_640 },
  { label: 'Kmart Eastbrook', valueCents: 6_490 },
  { label: 'Mobile Co', valueCents: 3_500 },
]

export const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'] as const

export const MONTHLY_SPENDING = [312_040, 298_550, 351_260, 287_400, 357_120, 328_450] as const
export const MONTHLY_INCOME = [612_000, 598_000, 645_000, 640_000, 610_000, 645_000] as const

export const SPENDING_BY_PERSON = {
  you: [162_040, 150_000, 171_020, 140_000, 180_000, 151_040],
  partner: [98_000, 101_550, 180_240, 97_400, 120_320, 101_820],
} as const

/** October's spending split; it adds up to the month total. */
export const WHO_PAID = { you: 151_040, partner: 101_820, shared: 75_590 } as const

export const EMERGENCY_FUND = {
  goalCents: 1_000_000,
  history: [
    { x: '2026-05', valueCents: 400_000 },
    { x: '2026-06', valueCents: 460_000 },
    { x: '2026-07', valueCents: 525_000 },
    { x: '2026-08', valueCents: 580_000 },
    { x: '2026-09', valueCents: 650_000 },
    { x: '2026-10', valueCents: 712_000 },
  ] satisfies MonthValue[],
  projection: [
    { x: '2026-11', valueCents: 775_000 },
    { x: '2026-12', valueCents: 840_000 },
    { x: '2027-01', valueCents: 905_000 },
    { x: '2027-02', valueCents: 970_000 },
    { x: '2027-03', valueCents: 1_035_000 },
    { x: '2027-04', valueCents: 1_100_000 },
  ] satisfies MonthValue[],
}
