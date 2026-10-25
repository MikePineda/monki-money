import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import PushSubscriptionService from '#services/push/push_subscription_service'
import PushDeviceTransformer from '#transformers/push_device_transformer'
import PushSubscriptionTransformer from '#transformers/push_subscription_transformer'
import {
  destroyPushSubscriptionValidator,
  pushDeviceParamsValidator,
  storePushSubscriptionValidator,
} from '#validators/push'

/** The signed-in person's Web Push devices in the current household. */
@inject()
export default class PushSubscriptionsController {
  constructor(protected subscriptions: PushSubscriptionService) {}

  /** GET /push/subscriptions: the person's devices (browser, platform, last push), never endpoints. */
  async index(ctx: HttpContext) {
    const devices = await this.subscriptions.devices(ctx.household, ctx.auth.getUserOrFail())

    return ctx.serialize(PushDeviceTransformer.transform(devices))
  }

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

  /** DELETE /push/subscriptions/:id: 204; 404 for a device that is not this person's. */
  async remove(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(pushDeviceParamsValidator)

    await this.subscriptions.remove(ctx.household, ctx.auth.getUserOrFail(), params.id)

    return ctx.response.noContent()
  }
}
