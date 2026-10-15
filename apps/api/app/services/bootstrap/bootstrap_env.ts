import vine, { errors } from '@vinejs/vine'
import { LOCALES } from '@monkimoney/shared'
import type { BootstrapInput, SeedPlan, SmokeUserInput } from '#services/bootstrap/dto'

type EnvReader = (key: string) => string | undefined

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

const smokeSchema = vine.create({
  SMOKE_EMAIL: vine.string().trim().toLowerCase().email(),
  SMOKE_PASSWORD: vine.string().minLength(10).maxLength(128),
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
 * Any of these set means "seed the real household", and then the whole block
 * must be valid. SEED_LOCALE is left out: .env.example ships it with a value.
 */
const HOUSEHOLD_KEYS = SEED_KEYS.filter((key) => key !== 'SEED_LOCALE')

const SMOKE_KEYS = ['SMOKE_EMAIL', 'SMOKE_PASSWORD'] as const

/** Blank values count as unset. */
function readSet(read: EnvReader, key: string) {
  const value = read(key)
  return value?.trim() ? value : undefined
}

/** Fails when only part of an all-or-nothing group of variables is set. */
function requireAllOrNone(raw: Record<string, string | undefined>, keys: readonly string[]) {
  const given = keys.filter((key) => raw[key] !== undefined)
  if (given.length > 0 && given.length < keys.length) {
    const missing = keys.filter((key) => raw[key] === undefined)
    const prefix = keys[0].replace(/_[^_]+$/, '_*')
    throw new Error(
      `Invalid production bootstrap env: set ${missing.join(', ')} or none of ${prefix}`
    )
  }
  return given.length > 0
}

/**
 * Runs a VineJS validation and rethrows a message that names the variables
 * (and the failed rule) but never echoes a value (passwords).
 */
async function validateEnv<T>(validate: () => Promise<T>): Promise<T> {
  try {
    return await validate()
  } catch (error) {
    if (error instanceof errors.E_VALIDATION_ERROR) {
      const fields = (error.messages as Array<{ field: string; rule: string }>).map(
        (message) => `${message.field} (${message.rule})`
      )
      throw new Error(`Invalid production bootstrap env: ${fields.join(', ')}`)
    }
    throw error
  }
}

/**
 * Reads the flat SEED_* variables (validated as optional strings in
 * start/env.ts) into the bootstrap input. User 2 is all-or-nothing. Errors
 * name the variables but never echo their values (passwords).
 */
export async function readBootstrapInput(read: EnvReader): Promise<BootstrapInput> {
  const raw = Object.fromEntries(SEED_KEYS.map((key) => [key, readSet(read, key)]))
  requireAllOrNone(raw, USER2_KEYS)

  const values = await validateEnv(() => schema.validate(raw))

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

/** Reads SMOKE_EMAIL / SMOKE_PASSWORD (all-or-nothing); null when neither is set. */
export async function readSmokeUserInput(read: EnvReader): Promise<SmokeUserInput | null> {
  const raw = Object.fromEntries(SMOKE_KEYS.map((key) => [key, readSet(read, key)]))
  if (!requireAllOrNone(raw, SMOKE_KEYS)) return null

  const values = await validateEnv(() => smokeSchema.validate(raw))
  return { email: values.SMOKE_EMAIL, password: values.SMOKE_PASSWORD }
}

/**
 * Decides what one seeder run creates: the real household (when any SEED_*
 * household variable is set) and/or the smoke user. The smoke user may never
 * be one of the household's users, so the post-deploy smoke run can never log
 * into the real household.
 */
export async function readSeedPlan(read: EnvReader): Promise<SeedPlan> {
  const wantsHousehold = HOUSEHOLD_KEYS.some((key) => readSet(read, key) !== undefined)
  const household = wantsHousehold ? await readBootstrapInput(read) : null
  const smoke = await readSmokeUserInput(read)

  if (!household && !smoke) {
    throw new Error(
      'Invalid production bootstrap env: nothing to seed (set the SEED_* household variables and/or SMOKE_EMAIL + SMOKE_PASSWORD)'
    )
  }

  if (household && smoke) {
    const householdEmails = [household.owner.email, household.member?.email]
    if (householdEmails.includes(smoke.email)) {
      throw new Error(
        'Invalid production bootstrap env: SMOKE_EMAIL must differ from every SEED_USER*_EMAIL'
      )
    }
  }

  return { household, smoke }
}
