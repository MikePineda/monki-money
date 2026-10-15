import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { createHouseholdValidator } from '#validators/household'
import HouseholdService from '#services/households/household_service'
import HouseholdTransformer from '#transformers/household_transformer'
import MembershipTransformer from '#transformers/membership_transformer'

/**
 * Households as a collection: creating one for a verified user who has
 * none. Everything about the current household lives in
 * HouseholdController.
 */
@inject()
export default class HouseholdsController {
  constructor(protected households: HouseholdService) {}

  /**
   * POST /households: 201 `{ household, membership }` (the user is its
   * owner and it becomes their current household); 409
   * E_ALREADY_IN_HOUSEHOLD when they already have one.
   */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createHouseholdValidator)

    const { household, membership } = await this.households.createFor(
      ctx.auth.getUserOrFail(),
      payload
    )

    ctx.response.status(201)
    return ctx.serialize({
      household: HouseholdTransformer.transform(household),
      membership: MembershipTransformer.transform(membership),
    })
  }
}
