import type Invitation from '#models/invitation'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/**
 * A pending invitation as the owner sees it. Never the token, its hash or
 * the link: those only travel in the email to the invited address.
 */
export default class InvitationTransformer extends BaseTransformer<Invitation> {
  toObject() {
    return {
      id: this.resource.id,
      email: this.resource.email,
      role: this.resource.role,
      invitedByUserId: this.resource.invitedByUserId,
      expiresAt: isoTimestamp(this.resource.expiresAt)!,
      createdAt: isoTimestamp(this.resource.createdAt)!,
    }
  }
}
