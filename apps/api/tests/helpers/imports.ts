import type User from '#models/user'
import AccountCard from '#models/account_card'
import type { ApiClient } from '@japa/api-client'
import { createHousehold } from '#tests/helpers/household'
import type { LucidModel, ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

/**
 * Builders for the import functional tests. Every value is synthetic: the
 * fixtures under tests/fixtures/nab copy the NAB export structure only.
 */

/** Account number of tests/fixtures/nab/*.csv. */
export const EVERYDAY_NUMBER = '123456789'
export const SAVINGS_NUMBER = '987654321'

/**
 * The household the NAB fixtures belong to: two members, the taxonomy, a
 * joint NAB everyday account (card 1111 = owner, 2222 = member), joint NAB
 * savings and the owner's Hnry wallet.
 */
export async function nabHousehold(options: { savingsNumber?: string | null } = {}) {
  const home = await createHousehold({
    users: 2,
    taxonomy: true,
    accounts: [
      {
        name: 'Everyday',
        institution: 'NAB',
        kind: 'transaction',
        externalAccountNumber: EVERYDAY_NUMBER,
      },
      {
        name: 'Savings',
        institution: 'NAB',
        kind: 'savings',
        externalAccountNumber: options.savingsNumber ?? null,
      },
      { name: 'Hnry', institution: 'Hnry', kind: 'wallet', owner: 0 },
    ],
  })
  const [everyday, savings, hnry] = home.accounts
  await AccountCard.createMany([
    { accountId: everyday.id, cardSuffix: '1111', userId: home.owner.id },
    { accountId: everyday.id, cardSuffix: '2222', userId: home.member.id },
  ])
  return { ...home, everyday, savings, hnry }
}

/** `POST /imports` with the CSV as the multipart `file` field. */
export function uploadCsv(
  client: ApiClient,
  user: User,
  csv: Buffer,
  options: { accountId?: number; filename?: string } = {}
) {
  const request = client
    .post('/api/v1/imports')
    .file('file', csv, { filename: options.filename ?? 'export.csv', contentType: 'text/csv' })
  if (options.accountId !== undefined) request.field('accountId', options.accountId)
  return request.actingAs(user)
}

export interface NabLine {
  date: string
  amount: string
  account?: string
  type?: string
  details: string
  balance?: string
  category?: string
  merchant?: string
  /** Empty = still pending at the bank. Defaults to `date`. */
  processedOn?: string
}

function cell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** One NAB data line (columns in the export's order). */
export function nabLine(line: NabLine): string {
  return [
    line.date,
    line.amount,
    line.account ?? EVERYDAY_NUMBER,
    '',
    line.type ?? 'MISCELLANEOUS DEBIT',
    line.details,
    line.balance ?? '',
    line.category ?? '',
    line.merchant ?? '',
    line.processedOn ?? line.date,
  ]
    .map(cell)
    .join(',')
}

/** `SELECT COUNT(*)` of a model query. */
export async function countOf(query: ModelQueryBuilderContract<LucidModel, unknown>) {
  const [row] = await query.count('* as total')
  return Number((row as { $extras: Record<string, unknown> }).$extras.total)
}

/** Rows of `GET /imports/:id` whose bank details start with `prefix`. */
export function rowsStartingWith(rows: any[], prefix: string): any[] {
  return rows.filter((row) => row.description.startsWith(prefix))
}
