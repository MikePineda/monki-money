import { basename } from 'node:path'
import { readFile } from 'node:fs/promises'
import { args, BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * `node ace import:nab <file> --account <number|id> --household <id> [--confirm-auto]`:
 * the backfill path (local, or inside the production container) for a NAB
 * CSV export. Stages the file exactly like `POST /imports` (as the
 * household's owner) and prints a summary per batch. With --confirm-auto it
 * confirms what needs no person (matches, known transfers, zero-amount
 * checks, new rows that already have a category) and leaves the rest in the
 * staged batch for the review screen. The file is read from disk and never
 * copied anywhere else (the bucket archive aside, when a disk is set).
 */
export default class ImportNab extends BaseCommand {
  static override commandName = 'import:nab'
  static override description = 'Stage a NAB CSV export for a household (backfill)'
  static override options: CommandOptions = { startApp: true }

  @args.string({ description: 'Path to the NAB CSV export' })
  declare file: string

  @flags.string({ description: 'Bank account number (or account id) the file belongs to' })
  declare account: string

  @flags.number({ description: 'Household id' })
  declare household: number

  @flags.boolean({
    description: 'Confirm the rows that need no review; leave the rest staged',
  })
  declare confirmAuto?: boolean

  override async run() {
    // App code is imported lazily, after the app (and its providers) booted.
    const { default: Account } = await import('#models/account')
    const { default: Household } = await import('#models/household')
    const { default: HouseholdMember } = await import('#models/household_member')
    const { default: ImportService } = await import('#services/imports/import_service')
    const { CsvImportError } = await import('#importers/errors')
    const { FieldError } = await import('#exceptions/field_error')
    const { Exception } = await import('@adonisjs/core/exceptions')

    if (!this.account || !this.household) {
      return this.fail('--account and --household are required')
    }
    const household = await Household.find(this.household)
    if (!household) return this.fail(`Household ${this.household} not found`)

    const ownership = await HouseholdMember.query()
      .where('household_id', household.id)
      .where('role', 'owner')
      .preload('user')
      .orderBy('id')
      .first()
    if (!ownership) return this.fail(`Household ${household.id} has no owner`)

    const accounts = await Account.query().where('household_id', household.id)
    const account =
      accounts.find((candidate) => candidate.externalAccountNumber === this.account) ??
      accounts.find((candidate) => String(candidate.id) === this.account)
    if (!account) return this.fail(`No account "${this.account}" in household ${household.id}`)

    const imports = await this.app.container.make(ImportService)
    try {
      const buffer = await readFile(this.file)
      const batches = await imports.stage(household, ownership.user, {
        buffer,
        fileName: basename(this.file),
        accountId: account.id,
      })
      this.summarize(batches, account.name)

      if (this.confirmAuto) {
        for (const batch of batches.filter((candidate) => candidate.isStaged)) {
          const result = await imports.confirm(household, ownership.user, batch.id, {}, 'ready')
          const { reconciliation } = result
          this.logger.info(
            `batch #${batch.id} confirmed: ${result.created} created, ${result.matched} matched, ` +
              `${result.transfers} transfers, ${result.ignored} ignored; ` +
              `${result.remaining} left for review (${result.status})`
          )
          this.logger.info(
            `balance on ${reconciliation.asOf}: bank ${cents(reconciliation.expectedBalanceCents)}, ` +
              `ledger ${cents(reconciliation.computedBalanceCents)}` +
              (reconciliation.missingBefore
                ? `; movements before ${reconciliation.missingBefore} are missing`
                : '')
          )
        }
      }
    } catch (error) {
      if (
        error instanceof CsvImportError ||
        error instanceof FieldError ||
        (error instanceof Exception && (error.status ?? 500) < 500)
      ) {
        const details = (error as { details?: unknown }).details
        return this.fail(
          `${error.code ?? 'E_IMPORT'}: ${error.message}${details ? ` ${JSON.stringify(details)}` : ''}`
        )
      }
      throw error
    }
  }

  protected summarize(
    batches: Array<{
      id: number
      status: string
      rowCount: number
      newCount: number
      matchedCount: number
      confirmationCount: number
      transferCount: number
      ignoredCount: number
      duplicateCount: number
      expectedBalanceCents: number | null
      computedBalanceCents: number | null
    }>,
    accountName: string
  ) {
    const table = this.ui.table()
    table.head([
      'Batch',
      'Account',
      'Status',
      'Rows',
      'New',
      'Matched',
      'Review',
      'Transfers',
      'Ignored',
      'Duplicates',
    ])
    for (const batch of batches) {
      table.row([
        `#${batch.id}`,
        accountName,
        batch.status,
        String(batch.rowCount),
        String(batch.newCount),
        String(batch.matchedCount),
        String(batch.confirmationCount),
        String(batch.transferCount),
        String(batch.ignoredCount),
        String(batch.duplicateCount),
      ])
    }
    table.render()
    for (const batch of batches) {
      this.logger.info(
        `batch #${batch.id}: ${batch.newCount} new, ${batch.matchedCount} matched, ` +
          `${batch.confirmationCount} to review, ${batch.transferCount} transfers, ` +
          `${batch.ignoredCount} ignored, ${batch.duplicateCount} duplicates; ` +
          `bank balance ${cents(batch.expectedBalanceCents)}, ledger after confirm ${cents(batch.computedBalanceCents)}`
      )
    }
  }

  protected fail(message: string) {
    this.logger.error(message)
    this.exitCode = 1
  }
}

function cents(value: number | null) {
  return value === null ? 'n/a' : (value / 100).toFixed(2)
}
