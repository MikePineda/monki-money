import vine, { errors } from '@vinejs/vine'
import { LOCALES } from '@monkimoney/shared'
import type { BootstrapInput } from '#services/bootstrap/dto'

const optionalText = () =>
  vine
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)

const schema = vine.create({
  SEED_HOUSEHOLD_NAME: vine.string().trim().minLength(1).maxLength(120),
  SEED_LOCALE: vine.enum(LOCALES).optional(),
  SEED_USER1_EMAIL: vine.string().trim().toLowerCase().email(),
  SEED_USER1_NAME: vine.string().trim().minLength(1).maxLength(120),
  SEED_USER1_PASSWORD: vine.string().minLength(10).maxLength(128),
  SEED_USER1_CARD_SUFFIX: optionalText(),
  SEED_USER2_EMAIL: vine.string().trim().toLowerCase().email().optional(),
  SEED_USER2_NAME: vine.string().trim().minLength(1).maxLength(120).optional(),
  SEED_USER2_PASSWORD: vine.string().minLength(10).maxLength(128).optional(),
  SEED_USER2_CARD_SUFFIX: optionalText(),
  SEED_JOINT_ACCOUNT_NUMBER: optionalText(),
})

const SEED_KEYS = [
  'SEED_HOUSEHOLD_NAME',
  'SEED_LOCALE',
  'SEED_USER1_EMAIL',
  'SEED_USER1_NAME',
  'SEED_USER1_PASSWORD',
  'SEED_USER1_CARD_SUFFIX',
  'SEED_USER2_EMAIL',
  'SEED_USER2_NAME',
  'SEED_USER2_PASSWORD',
  'SEED_USER2_CARD_SUFFIX',
  'SEED_JOINT_ACCOUNT_NUMBER',
] as const

const USER2_KEYS = ['SEED_USER2_EMAIL', 'SEED_USER2_NAME', 'SEED_USER2_PASSWORD'] as const

/**
 * Reads the flat SEED_* variables (validated as optional strings in
 * start/env.ts) into the bootstrap input. User 2 is all-or-nothing. Errors
 * name the variables but never echo their values (passwords).
 */
export async function readBootstrapInput(
  read: (key: string) => string | undefined
): Promise<BootstrapInput> {
  const raw = Object.fromEntries(
    SEED_KEYS.map((key) => [key, read(key)?.trim() ? read(key) : undefined])
  )

  const user2Given = USER2_KEYS.filter((key) => raw[key] !== undefined)
  if (user2Given.length > 0 && user2Given.length < USER2_KEYS.length) {
    const missing = USER2_KEYS.filter((key) => raw[key] === undefined)
    throw new Error(
      `Invalid production bootstrap env: set ${missing.join(', ')} or none of SEED_USER2_*`
    )
  }

  let values
  try {
    values = await schema.validate(raw)
  } catch (error) {
    if (error instanceof errors.E_VALIDATION_ERROR) {
      const fields = (error.messages as Array<{ field: string; rule: string }>).map(
        (message) => `${message.field} (${message.rule})`
      )
      throw new Error(`Invalid production bootstrap env: ${fields.join(', ')}`)
    }
    throw error
  }

  return {
    householdName: values.SEED_HOUSEHOLD_NAME,
    locale: values.SEED_LOCALE ?? 'en',
    owner: {
      email: values.SEED_USER1_EMAIL,
      fullName: values.SEED_USER1_NAME,
      password: values.SEED_USER1_PASSWORD,
      cardSuffix: values.SEED_USER1_CARD_SUFFIX ?? null,
    },
    member: values.SEED_USER2_EMAIL
      ? {
          email: values.SEED_USER2_EMAIL,
          fullName: values.SEED_USER2_NAME!,
          password: values.SEED_USER2_PASSWORD!,
          cardSuffix: values.SEED_USER2_CARD_SUFFIX ?? null,
        }
      : null,
    jointAccountNumber: values.SEED_JOINT_ACCOUNT_NUMBER ?? null,
  }
}
