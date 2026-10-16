import type { Data } from '@monkimoney/api/data'

/**
 * Wire shapes of the API resources, inferred from the API transformers
 * through the Tuyau codegen. Only core/api may import the API packages, so
 * the rest of the app takes its types from here.
 */
export type User = Data.User
export type Household = Data.Household
export type Membership = Data.Membership
export type Member = Data.Member
export type Invitation = Data.Invitation
export type Account = Data.Account
export type AccountCard = Data.AccountCard
/** A ledger row as the reader may see it (`isMasked` for a partner's private one). */
export type Transaction = Data.Transaction
export type TransactionSplit = Data.TransactionSplit
export type Transfer = Data.Transfer
/** A savings goal (`userId` null = the household's). */
export type Goal = Data.Goal
/** A payout recorded as its gross and deductions, linked to the transfer of the net. */
export type Payslip = Data.Payslip
/** The LLM-written summary of a month, in the reader's language. */
export type MonthlyInsight = Data.MonthlyInsight
/** A bank import batch (one account of one upload) with its counts and reconciliation. */
export type ImportBatch = Data.ImportBatch
/** `GET /imports/:id`: the batch plus its rows in file order. */
export type ImportBatchDetail = Data.ImportBatchDetail
/** One staged bank row: the importer's proposal and the person's decision. */
export type ImportRow = Data.ImportRow
/** A merchant rule (`origin`: user, learned or system). */
export type MerchantRule = Data.MerchantRule
/** A recurring payment (rent, a subscription): detected from the ledger or typed by hand. */
export type RecurringItem = Data.RecurringItem
