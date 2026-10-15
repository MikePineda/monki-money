import vine from '@vinejs/vine'
import { ACCOUNT_KINDS } from '@monkimoney/shared'
import { cents, id, idParams, isoDate } from '#validators/rules'

const accountFields = {
  name: vine.string().trim().minLength(1).maxLength(80),
  kind: vine.enum(ACCOUNT_KINDS),
  institution: vine.string().trim().maxLength(40).nullable().optional(),
  ownerUserId: id().nullable().optional(),
  currencyCode: vine
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  externalAccountNumber: vine.string().trim().minLength(1).maxLength(64).nullable().optional(),
  openingBalanceCents: cents().optional(),
  openingBalanceDate: isoDate().nullable().optional(),
  isActive: vine.boolean().optional(),
}

export const createAccountValidator = vine.create(accountFields)

export const updateAccountValidator = vine.create({
  params: idParams(),
  ...accountFields,
  name: accountFields.name.optional(),
  kind: accountFields.kind.optional(),
})

export const accountParamsValidator = vine.create({
  params: idParams(),
})

export const addCardValidator = vine.create({
  params: idParams(),
  cardSuffix: vine
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,8}$/),
  userId: id().nullable().optional(),
  label: vine.string().trim().maxLength(60).nullable().optional(),
})

export const cardParamsValidator = vine.create({
  params: vine.object({ id: id(), cardId: id() }),
})
