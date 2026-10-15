import { DateTime } from 'luxon'
import User from '#models/user'
import factory from '@adonisjs/lucid/factories'

/** Password every factory user gets (tests log in with it). */
export const FACTORY_PASSWORD = 'correct-horse-battery'

/** Synthetic, verified users. `.apply('unverified')` for a pending email. */
export const UserFactory = factory
  .define(User, ({ faker }) => ({
    email: `${faker.string.alphanumeric(10).toLowerCase()}@example.test`,
    password: FACTORY_PASSWORD,
    fullName: faker.person.fullName(),
    locale: 'en' as const,
    theme: 'system' as const,
    emailVerifiedAt: DateTime.now(),
    sessionVersion: 1,
  }))
  .state('unverified', (user) => {
    user.emailVerifiedAt = null
  })
  .state('spanish', (user) => {
    user.locale = 'es'
  })
  .build()
