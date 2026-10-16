import type User from '#models/user'
import { inject } from '@adonisjs/core'
import type Account from '#models/account'
import Payslip from '#models/payslip'
import Transfer from '#models/transfer'
import type Household from '#models/household'
import Transaction from '#models/transaction'
import db from '@adonisjs/lucid/services/db'
import { defaultPayer } from '#domain/ledger/payer'
import { FieldError } from '#exceptions/field_error'
import { isHiddenFrom } from '#domain/ledger/privacy'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import { PayslipLineReadOnly, PrivateTransaction } from '#exceptions/errors'
import { findInHousehold } from '#repositories/scoped'
import { isUniqueViolationOn } from '#services/ledger/unique_violation'
import LedgerReferences from '#services/ledger/ledger_references'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { CreateTransferInput, UpdateTransferInput } from '#services/ledger/dto'

/** Partial unique index of migration 10: one transfer per (household, client_id). */
const CLIENT_ID_CONSTRAINT = 'transfers_household_client_id_unique'

/**
 * Transfers between two accounts of the household: one `transfers` row
 * plus two legs in `transactions` (kind `transfer`): the outgoing leg is
 * negative on the source account, the incoming one positive on the
 * destination. The three rows are always written in one DB transaction.
 */
@inject()
export default class TransferService {
  constructor(protected references: LedgerReferences) {}

  async find(household: HouseholdRef, transferId: number) {
    const transfer = await findInHousehold(Transfer, household, transferId)
    await transfer.load('legs', (legs) => legs.preload('splits').orderBy('amount_cents'))
    return transfer
  }

  async create(
    household: Household,
    actor: User,
    input: CreateTransferInput
  ): Promise<{ transfer: Transfer; created: boolean }> {
    if (input.clientId) {
      const existing = await this.findByClientId(household, input.clientId)
      if (existing) return { transfer: existing, created: false }
    }

    const { from, to } = await this.accounts(household, input.fromAccountId, input.toAccountId)

    try {
      const transferId = await db.transaction(async (trx) => {
        const transfer = await this.insert(household, actor, { ...input, from, to }, trx)
        return transfer.id
      })
      return { transfer: await this.find(household, transferId), created: true }
    } catch (error) {
      if (input.clientId && isUniqueViolationOn(error, CLIENT_ID_CONSTRAINT)) {
        const existing = await this.findByClientId(household, input.clientId)
        if (existing) return { transfer: existing, created: false }
      }
      throw error
    }
  }

  /**
   * Writes the transfer row and both legs inside the caller's DB
   * transaction (a payslip creates its payout this way). `from` and `to`
   * must come from {@link accounts}: checked, of the household, different.
   */
  async insert(
    household: Household,
    actor: User,
    input: Omit<CreateTransferInput, 'fromAccountId' | 'toAccountId'> & {
      from: Account
      to: Account
    },
    trx: TransactionClientContract
  ) {
    const transfer = await Transfer.create(
      {
        householdId: household.id,
        date: input.date,
        amountCents: input.amountCents,
        fromAccountId: input.from.id,
        toAccountId: input.to.id,
        memo: input.memo ?? null,
        clientId: input.clientId ?? null,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      },
      { client: trx }
    )
    const tags = input.tags ?? []
    await Transaction.createMany(
      [
        { ...this.leg(transfer, input.from, -transfer.amountCents, actor), tags },
        { ...this.leg(transfer, input.to, transfer.amountCents, actor), tags },
      ],
      { client: trx }
    )
    return transfer
  }

  /**
   * Changes the transfer and rewrites both legs from the row locked inside
   * the DB transaction, so overlapping edits (amount vs memo) can never
   * leave the legs disagreeing with the transfer. The amount and source
   * account of a transfer a payslip links belong to the payslip (it is
   * its net): changing them answers 409 `E_PAYSLIP_LINE`. A leg that is the
   * partner's private row makes the whole transfer theirs to change (403).
   */
  async update(household: Household, actor: User, transferId: number, input: UpdateTransferInput) {
    await db.transaction(async (trx) => {
      const transfer = await this.lockForWrite(household, actor, transferId, trx)
      const movesTheNet =
        (input.amountCents !== undefined && input.amountCents !== transfer.amountCents) ||
        (input.fromAccountId !== undefined && input.fromAccountId !== transfer.fromAccountId)
      if (movesTheNet) {
        const payslip = await Payslip.query({ client: trx })
          .where('transfer_id', transfer.id)
          .first()
        if (payslip) throw new PayslipLineReadOnly()
      }
      const { from, to } = await this.accounts(
        household,
        input.fromAccountId ?? transfer.fromAccountId,
        input.toAccountId ?? transfer.toAccountId
      )

      transfer.merge({
        date: input.date ?? transfer.date,
        amountCents: input.amountCents ?? transfer.amountCents,
        fromAccountId: from.id,
        toAccountId: to.id,
        memo: input.memo === undefined ? transfer.memo : input.memo,
        updatedByUserId: actor.id,
      })
      await transfer.save()
      await this.rewriteLegs(transfer, from, to, actor, trx, input.tags)
    })

    return this.find(household, transferId)
  }

  /** Deletes the transfer and both legs (403 when a leg is the partner's private row). */
  async destroy(household: Household, actor: User, transferId: number) {
    await db.transaction(async (trx) => {
      const transfer = await this.lockForWrite(household, actor, transferId, trx)
      await Transaction.query({ client: trx }).where('transfer_id', transfer.id).delete()
      await transfer.delete()
    })
  }

  /**
   * The transfer locked inside `trx` (404 across households); 403
   * `E_TRANSACTION_PRIVATE` when either leg is a private row whose details
   * `actor` may not see, like a private transaction's own update.
   */
  protected async lockForWrite(
    household: HouseholdRef,
    actor: User,
    transferId: number,
    trx: TransactionClientContract
  ) {
    const transfer = await Transfer.query({ client: trx })
      .where('household_id', householdIdOf(household))
      .where('id', transferId)
      .forUpdate()
      .firstOrFail()
    const legs = await Transaction.query({ client: trx })
      .where('transfer_id', transfer.id)
      .select('id', 'is_private', 'paid_by_user_id', 'created_by_user_id')
    const viewer = await privacyViewer(household, actor)
    if (legs.some((leg) => isHiddenFrom(leg, viewer))) throw new PrivateTransaction()
    return transfer
  }

  protected async findByClientId(household: HouseholdRef, clientId: string) {
    const existing = await Transfer.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('client_id', clientId)
      .first()
    return existing ? this.find(household, existing.id) : null
  }

  /** Both accounts of the household (422 each) and different (422 on `toAccountId`). */
  async accounts(household: HouseholdRef, fromAccountId: number, toAccountId: number) {
    if (fromAccountId === toAccountId) throw new FieldError('toAccountId', 'sameAccount')
    return {
      from: await this.references.account(household, fromAccountId, 'fromAccountId'),
      to: await this.references.account(household, toAccountId, 'toAccountId'),
    }
  }

  protected leg(transfer: Transfer, account: Account, amountCents: number, actor: User) {
    return {
      householdId: transfer.householdId,
      accountId: account.id,
      kind: 'transfer' as const,
      date: transfer.date,
      amountCents,
      currencyCode: account.currencyCode,
      description: transfer.memo,
      transferId: transfer.id,
      paidByUserId: defaultPayer({
        accountOwnerUserId: account.ownerUserId,
        cards: account.cards,
        creatorUserId: actor.id,
      }),
      status: 'cleared' as const,
      source: 'manual' as const,
      createdByUserId: actor.id,
      updatedByUserId: actor.id,
    }
  }

  /**
   * Both legs follow the transfer. `tags` replaces the labels of both legs
   * when given; otherwise each leg keeps its own (a recreated missing leg
   * copies the other one's).
   */
  protected async rewriteLegs(
    transfer: Transfer,
    from: Account,
    to: Account,
    actor: User,
    trx: TransactionClientContract,
    tags?: string[]
  ) {
    const legs = await Transaction.query({ client: trx })
      .where('transfer_id', transfer.id)
      .orderBy('amount_cents')
    const outgoing = legs.find((leg) => leg.amountCents < 0)
    const incoming = legs.find((leg) => leg !== outgoing)
    const legTags = tags ?? outgoing?.tags ?? incoming?.tags ?? []

    for (const [leg, account, amountCents] of [
      [outgoing, from, -transfer.amountCents],
      [incoming, to, transfer.amountCents],
    ] as const) {
      const values = this.leg(transfer, account, amountCents, actor)
      if (!leg) {
        await Transaction.create({ ...values, tags: legTags }, { client: trx })
        continue
      }
      leg.useTransaction(trx)
      leg.merge({
        accountId: values.accountId,
        date: values.date,
        amountCents: values.amountCents,
        currencyCode: values.currencyCode,
        description: values.description,
        updatedByUserId: actor.id,
        ...(tags === undefined ? {} : { tags }),
        ...(leg.accountId === account.id ? {} : { paidByUserId: values.paidByUserId }),
      })
      await leg.save()
    }
  }
}
