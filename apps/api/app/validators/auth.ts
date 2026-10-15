import vine from '@vinejs/vine'
import { LOCALES, THEMES } from '@monkimoney/shared'
import { email, newPassword, turnstileToken } from '#validators/rules'

export const signupValidator = vine.create({
  fullName: vine.string().trim().minLength(1).maxLength(120),
  email: email().unique({ table: 'users', column: 'email' }),
  password: newPassword(),
  locale: vine.enum(LOCALES).optional(),
  householdName: vine.string().trim().minLength(1).maxLength(120).optional(),
  turnstileToken: turnstileToken(),
})

export const loginValidator = vine.create({
  email: email(),
  password: vine.string().maxLength(128),
  turnstileToken: turnstileToken(),
})

export const verifyEmailValidator = vine.create({
  token: vine.string().trim().minLength(1).maxLength(2048),
})

export const forgotPasswordValidator = vine.create({
  email: email(),
  turnstileToken: turnstileToken(),
})

export const resetPasswordValidator = vine.create({
  token: vine.string().trim().minLength(1).maxLength(2048),
  password: newPassword(),
})

export const updateProfileValidator = vine.create({
  fullName: vine.string().trim().minLength(1).maxLength(120).optional(),
  locale: vine.enum(LOCALES).optional(),
  theme: vine.enum(THEMES).optional(),
  password: newPassword().optional(),
  currentPassword: vine.string().maxLength(128).optional().requiredIfExists('password'),
})
