import type User from '#models/user'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/** The logged-in user (never the password). */
export default class UserTransformer extends BaseTransformer<User> {
  toObject() {
    return {
      id: this.resource.id,
      email: this.resource.email,
      fullName: this.resource.fullName,
      locale: this.resource.locale,
      theme: this.resource.theme,
      emailVerifiedAt: isoTimestamp(this.resource.emailVerifiedAt),
      currentHouseholdId: this.resource.currentHouseholdId,
      createdAt: isoTimestamp(this.resource.createdAt)!,
    }
  }
}
