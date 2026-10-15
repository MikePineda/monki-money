import type Household from '#models/household'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

export default class HouseholdTransformer extends BaseTransformer<Household> {
  toObject() {
    return {
      id: this.resource.id,
      name: this.resource.name,
      plan: this.resource.plan,
      status: this.resource.status,
      currencyCode: this.resource.currencyCode,
      locale: this.resource.locale,
      timezone: this.resource.timezone,
      settings: this.resource.settings,
      deletionScheduledAt: isoTimestamp(this.resource.deletionScheduledAt),
      createdAt: isoTimestamp(this.resource.createdAt)!,
    }
  }
}
