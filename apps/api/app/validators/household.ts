import vine from '@vinejs/vine'
import { LOCALES, MEMBER_ROLES } from '@monkimoney/shared'
import { email, idParams, timezone } from '#validators/rules'

export const updateHouseholdValidator = vine.create({
  name: vine.string().trim().minLength(1).maxLength(120).optional(),
  locale: vine.enum(LOCALES).optional(),
  timezone: timezone().optional(),
})

export const deleteHouseholdValidator = vine.create({
  password: vine.string().maxLength(128),
})

export const exportHouseholdValidator = vine.create({
  /** json: everything; csv: the ledger, one row per posting (formula-escaped). */
  format: vine.enum(['json', 'csv'] as const).optional(),
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
