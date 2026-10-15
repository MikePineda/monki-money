import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'

/**
 * Placeholder user model from the starter kit, kept so the session guard
 * compiles. The real users table (household membership, locale, theme,
 * session_version...) arrives with the API base work package.
 */
export default class User extends compose(UserSchema, withAuthFinder(hash)) {}
