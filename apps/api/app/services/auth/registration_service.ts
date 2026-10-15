import env from '#start/env'
import User from '#models/user'
import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import { FieldError } from '#exceptions/field_error'
import { firstName } from '#mails/localized_mail'
import { RegistrationClosed } from '#exceptions/errors'
import i18nManager from '@adonisjs/i18n/services/main'
import type { SignupInput } from '#services/auth/dto'
import HouseholdCreator from '#services/households/household_creator'
import EmailVerificationService from '#services/auth/email_verification_service'

/**
 * Public sign-up, gated by REGISTRATION_OPEN (read per request so tests and
 * a redeploy can flip it). Creates the user, their household (owner, shared
 * taxonomy in their locale) and sends the verification mail.
 */
@inject()
export default class RegistrationService {
  constructor(
    protected households: HouseholdCreator,
    protected verification: EmailVerificationService
  ) {}

  isOpen() {
    return env.get('REGISTRATION_OPEN') === true
  }

  async register(input: SignupInput) {
    if (!this.isOpen()) throw new RegistrationClosed()

    const householdName =
      input.householdName ??
      i18nManager
        .locale(input.locale)
        .t('messages.household.defaultName', { firstName: firstName(input.fullName) })

    const result = await db
      .transaction(async (trx) => {
        const user = await User.create(
          {
            fullName: input.fullName,
            email: input.email,
            password: input.password,
            locale: input.locale,
            theme: 'system',
            sessionVersion: 1,
          },
          { client: trx }
        )
        const { household, membership } = await this.households.create(
          { owner: user, name: householdName, locale: input.locale },
          trx
        )
        return { user, household, membership }
      })
      .catch((error) => {
        // Lost a race with another sign-up for the same address.
        if (error?.code === '23505') throw new FieldError('email', 'database.unique')
        throw error
      })

    await this.verification.send(result.user)
    return result
  }
}
