import type Invitation from '#models/invitation'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/**
 * A pending invitation as the owner sees it. Never the token hash; the
 * shareable `url` (clear token) only right after creation, null afterwards.
 */
export default class InvitationTransformer extends BaseTransformer<Invitation> {
  constructor(
    resource: Invitation,
    protected url: string | null = null
  ) {
    super(resource)
  }

  toObject() {
    return {
      id: this.resource.id,
      email: this.resource.email,
      role: this.resource.role,
      invitedByUserId: this.resource.invitedByUserId,
      expiresAt: isoTimestamp(this.resource.expiresAt)!,
      createdAt: isoTimestamp(this.resource.createdAt)!,
      url: this.url,
    }
  }
}
