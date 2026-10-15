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
export type Transaction = Data.Transaction
export type TransactionSplit = Data.TransactionSplit
export type Transfer = Data.Transfer
