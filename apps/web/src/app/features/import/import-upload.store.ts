import { Injectable, computed, inject, resource, signal } from '@angular/core'
import type { ImportBatch } from '../../core/api/api-types'
import { failureMessage, type Message } from '../../core/api/error-messages'
import { toApiError } from '../../core/api/http-errors'
import { UploadAbortedError } from '../../core/api/upload.service'
import { AccountsApi } from '../../core/household/accounts.api'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import {
  checkCsvFile,
  stagedOutcome,
  type CsvFileProblem,
  type StagedNext,
  type UploadOutcome,
} from '../../domain/import-upload'
import { ImportsApi } from './data-access/imports.api'

/** Why the last upload did not stage anything, for the message under the picker. */
export type UploadProblem =
  | { kind: 'file'; problem: CsvFileProblem }
  | {
      kind: 'csv'
      code: string
      message: string | null
      line: number | null
      column: string | null
    }
  | { kind: 'batchOpen'; batchId: number; accountId: number | null }
  | { kind: 'limit' }
  | { kind: 'invalid'; message: string }
  | { kind: 'failure'; message: Message }

/**
 * Where the upload screen is:
 * - `pick`: choose the account (optional) and the CSV;
 * - `uploading`: the file is going up (`progress` 0..1, null when unknown);
 * - `mapping`: the file has bank account numbers no account carries yet;
 * - `choose`: the file staged several accounts, reviewed one by one;
 * - `nothingNew`: every row was already imported.
 */
export type UploadStep =
  | { step: 'pick' }
  | { step: 'uploading'; fileName: string; sizeBytes: number; progress: number | null }
  | { step: 'mapping'; accountNumbers: string[] }
  | { step: 'choose'; batches: ImportBatch[] }
  | { step: 'nothingNew' }

/** An unknown account number goes to an existing account, or to a new one. */
export type MappingChoice = number | 'new'

/**
 * State of the upload screen `/import`. Picking a file checks it on the
 * device (format, ≤ 2 MB) and uploads it at once with real progress; the
 * upload can be cancelled. Unknown account numbers open a mapping step
 * (each number goes to an existing account, whose bank number is saved,
 * or to a new account) and the same file is sent again. Provided by the page.
 */
@Injectable()
export class ImportUploadStore {
  private readonly api = inject(ImportsApi)
  private readonly accountsApi = inject(AccountsApi)
  readonly directory = inject(HouseholdDirectory)

  /** The account the file belongs to; null = read it from the file. */
  readonly accountId = signal<number | null>(null)
  readonly step = signal<UploadStep>({ step: 'pick' })
  readonly problem = signal<UploadProblem | null>(null)
  readonly mapping = signal<Readonly<Record<string, MappingChoice | null>>>({})
  readonly mappingBusy = signal(false)
  /** Imports waiting for review, offered as "continue". */
  readonly openBatches = resource({ loader: () => this.api.staged() })

  readonly mappingComplete = computed(() => {
    const choices = Object.values(this.mapping())
    return choices.length > 0 && choices.every((choice) => choice !== null)
  })

  private file: File | null = null
  private controller: AbortController | null = null

  constructor() {
    void this.directory.load().catch(() => undefined)
  }

  /** Checks the picked file and, when it is a CSV within the limit, uploads it. */
  async pick(file: File): Promise<StagedNext | null> {
    const problem = checkCsvFile(file)
    if (problem) {
      this.problem.set({ kind: 'file', problem })
      return null
    }
    this.file = file
    return this.upload()
  }

  /** Sends the picked file (again, after a mapping); resolves with where to go next. */
  async upload(): Promise<StagedNext | null> {
    const file = this.file
    if (!file) {
      return null
    }
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    this.problem.set(null)
    this.step.set({ step: 'uploading', fileName: file.name, sizeBytes: file.size, progress: 0 })
    try {
      const outcome = await this.api.upload({
        file,
        accountId: this.accountId(),
        signal: controller.signal,
        onProgress: (progress) => this.progress(progress),
      })
      return this.settle(outcome)
    } catch (error) {
      this.step.set({ step: 'pick' })
      if (!(error instanceof UploadAbortedError)) {
        this.problem.set({ kind: 'failure', message: failureMessage({ kind: 'offline' }) })
      }
      return null
    } finally {
      if (this.controller === controller) {
        this.controller = null
      }
    }
  }

  /** Stops the upload in flight; the screen goes back to the picker. */
  cancel(): void {
    this.controller?.abort()
  }

  choose(accountNumber: string, choice: MappingChoice): void {
    this.mapping.update((current) => ({ ...current, [accountNumber]: choice }))
  }

  /**
   * Saves the mapping (the bank number on the chosen accounts, or new
   * accounts named by `newAccountName`) and uploads the same file again.
   */
  async applyMapping(
    newAccountName: (accountNumber: string) => string
  ): Promise<StagedNext | null> {
    if (!this.mappingComplete() || this.mappingBusy()) {
      return null
    }
    this.mappingBusy.set(true)
    this.problem.set(null)
    try {
      for (const [accountNumber, choice] of Object.entries(this.mapping())) {
        if (choice === 'new') {
          await this.accountsApi.create({
            name: newAccountName(accountNumber),
            kind: 'transaction',
            institution: 'NAB',
            externalAccountNumber: accountNumber,
          })
        } else if (choice !== null) {
          await this.accountsApi.update(choice, { externalAccountNumber: accountNumber })
        }
      }
      await this.directory.load(true).catch(() => undefined)
    } catch (error) {
      const apiError = toApiError(error)
      this.problem.set(
        apiError.kind === 'validation'
          ? { kind: 'invalid', message: Object.values(apiError.fields)[0] ?? '' }
          : { kind: 'failure', message: failureMessage(apiError) }
      )
      return null
    } finally {
      this.mappingBusy.set(false)
    }
    return this.upload()
  }

  /** Back to the picker ("Import another", leaving the mapping). */
  reset(): void {
    this.cancel()
    this.file = null
    this.mapping.set({})
    this.problem.set(null)
    this.step.set({ step: 'pick' })
  }

  private progress(progress: number | null): void {
    this.step.update((current) =>
      current.step === 'uploading' ? { ...current, progress } : current
    )
  }

  private settle(outcome: UploadOutcome<ImportBatch>): StagedNext | null {
    this.step.set({ step: 'pick' })
    switch (outcome.kind) {
      case 'staged': {
        const next = stagedOutcome(outcome.batches)
        if (next.next === 'choose') {
          this.step.set({
            step: 'choose',
            batches: outcome.batches.filter((batch) => batch.status === 'staged'),
          })
        } else if (next.next === 'nothingNew') {
          this.step.set({ step: 'nothingNew' })
        }
        this.openBatches.reload()
        return next
      }
      case 'unknownAccounts':
        this.mapping.set(Object.fromEntries(outcome.accountNumbers.map((number) => [number, null])))
        this.step.set({ step: 'mapping', accountNumbers: outcome.accountNumbers })
        return null
      case 'batchOpen':
        this.problem.set({
          kind: 'batchOpen',
          batchId: outcome.batchId,
          accountId: outcome.accountId,
        })
        return null
      case 'csvError':
        this.problem.set({
          kind: 'csv',
          code: outcome.code,
          message: outcome.message,
          line: outcome.line,
          column: outcome.column,
        })
        return null
      case 'invalid':
        this.problem.set({ kind: 'invalid', message: Object.values(outcome.fields)[0] ?? '' })
        return null
      case 'limitReached':
        this.problem.set({ kind: 'limit' })
        return null
      case 'unauthorized':
        // The session store sends the person to the login screen.
        return null
      case 'throttled':
        this.problem.set({
          kind: 'failure',
          message: failureMessage({ kind: 'throttled', status: 429, retryAfterSeconds: null }),
        })
        return null
      case 'failed':
        this.problem.set({
          kind: 'failure',
          message: failureMessage({ kind: 'server', status: outcome.status }),
        })
        return null
    }
  }
}
