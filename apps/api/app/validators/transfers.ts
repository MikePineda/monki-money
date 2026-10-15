import vine from '@vinejs/vine'
import { amount, id, idParams, isoDate, uuid } from '#validators/rules'

const memo = () => vine.string().trim().maxLength(255).nullable()

export const createTransferValidator = vine.create({
  clientId: uuid().optional(),
  fromAccountId: id(),
  toAccountId: id(),
  date: isoDate(),
  amountCents: amount(),
  memo: memo().optional(),
})

export const updateTransferValidator = vine.create({
  params: idParams(),
  fromAccountId: id().optional(),
  toAccountId: id().optional(),
  date: isoDate().optional(),
  amountCents: amount().optional(),
  memo: memo().optional(),
})

export const transferParamsValidator = vine.create({
  params: idParams(),
})
