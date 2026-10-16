import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import PushSubscriptionService from '#services/push/push_subscription_service'
import PushSubscriptionTransformer from '#transformers/push_subscription_transformer'
import { destroyPushSubscriptionValidator, storePushSubscriptionValidator } from '#validators/push'

/** This device's Web Push subscription for the signed-in person, in the current household. */
@inject()
export default class PushSubscriptionsController {
  constructor(protected subscriptions: PushSubscriptionService) {}

  /**
   * POST /push/subscriptions { endpoint, keys: { p256dh, auth } }: 201 new,
   * 200 refreshed (same endpoint again); 404 when the endpoint is someone
   * else's.
   */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(storePushSubscriptionValidator)

    const { subscription, created } = await this.subscriptions.subscribe(
      ctx.household,
      ctx.auth.getUserOrFail(),
      { endpoint: payload.endpoint, keys: payload.keys },
      ctx.request.header('user-agent') ?? null
    )

    ctx.response.status(created ? 201 : 200)
    return ctx.serialize(PushSubscriptionTransformer.transform(subscription))
  }

  /** DELETE /push/subscriptions { endpoint }: 204; 404 for an endpoint that is not this person's. */
  async destroy(ctx: HttpContext) {
    const { endpoint } = await ctx.request.validateUsing(destroyPushSubscriptionValidator)

    await this.subscriptions.unsubscribe(ctx.household, ctx.auth.getUserOrFail(), endpoint)

    return ctx.response.noContent()
  }
}
