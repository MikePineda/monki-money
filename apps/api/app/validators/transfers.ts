import vine from '@vinejs/vine'
import { tags } from '#validators/transactions'
import { amount, id, idParams, isoDate, uuid } from '#validators/rules'

const memo = () => vine.string().trim().maxLength(255).nullable()

/** `tags` land on both legs (money moved to savings for a trip counts as set aside). */
export const createTransferValidator = vine.create({
  clientId: uuid().optional(),
  fromAccountId: id(),
  toAccountId: id(),
  date: isoDate(),
  amountCents: amount(),
  memo: memo().optional(),
  tags: tags().optional(),
})

export const updateTransferValidator = vine.create({
  params: idParams(),
  fromAccountId: id().optional(),
  toAccountId: id().optional(),
  date: isoDate().optional(),
  amountCents: amount().optional(),
  memo: memo().optional(),
  tags: tags().optional(),
})

export const transferParamsValidator = vine.create({
  params: idParams(),
})
