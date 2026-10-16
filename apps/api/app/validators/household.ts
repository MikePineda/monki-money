import vine from '@vinejs/vine'
import { LOCALES, MEMBER_ROLES } from '@monkimoney/shared'
import { email, id, idParams, timezone } from '#validators/rules'

export const updateHouseholdValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120).optional(),
  locale: vine.enum(LOCALES).optional(),
  timezone: timezone().optional(),
})

export const createHouseholdValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120),
  locale: vine.enum(LOCALES).optional(),
  timezone: timezone().optional(),
  currencyCode: vine
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
})

export const deleteHouseholdValidator = vine.create({
  password: vine.string().maxLength(128),
})

export const exportHouseholdValidator = vine.create({
  /** json: one object, an array per table; csv: a zip, one CSV per table (formula-escaped). */
  format: vine.enum(['json', 'csv'] as const).optional(),
})

/** The member who becomes the owner, and the current owner's password. */
export const transferOwnershipValidator = vine.create({
  userId: id(),
  password: vine.string().maxLength(128),
})

export const createInvitationValidator = vine.create({
  email: email(),
  role: vine.enum(MEMBER_ROLES).optional(),
})

export const invitationParamsValidator = vine.create({
  params: idParams(),
})

/** Public invitation routes: the token from the link. */
export const invitationTokenValidator = vine.create({
  params: vine.object({ token: vine.string().trim().minLength(20).maxLength(128) }),
})

export const acceptInvitationValidator = vine.create({
  params: vine.object({ token: vine.string().trim().minLength(20).maxLength(128) }),
  fullName: vine.string().trim().minLength(1).maxLength(120).optional(),
  password: vine.string().maxLength(128).optional(),
})
