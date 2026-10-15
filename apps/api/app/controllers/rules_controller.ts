import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import RulesService from '#services/rules/rules_service'
import MerchantRuleTransformer from '#transformers/merchant_rule_transformer'
import {
  createRuleValidator,
  ruleParamsValidator,
  updateRuleValidator,
} from '#validators/merchant_rules'

/** Merchant rules of the current household (any member). */
@inject()
export default class RulesController {
  constructor(protected rules: RulesService) {}

  /** GET /rules: highest priority first. */
  async index(ctx: HttpContext) {
    const rules = await this.rules.list(ctx.household)
    return ctx.serialize(MerchantRuleTransformer.transform(rules))
  }

  /** POST /rules: 201; `origin = 'user'`. */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createRuleValidator)

    const rule = await this.rules.create(ctx.household, ctx.auth.getUserOrFail(), payload)

    ctx.response.status(201)
    return ctx.serialize(MerchantRuleTransformer.transform(rule))
  }

  /** PATCH /rules/:id: any field; the rule becomes the person's (`origin = 'user'`). */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateRuleValidator)

    const rule = await this.rules.update(ctx.household, params.id, payload)

    return ctx.serialize(MerchantRuleTransformer.transform(rule))
  }

  /** DELETE /rules/:id */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(ruleParamsValidator)

    await this.rules.destroy(ctx.household, params.id)

    return ctx.response.noContent()
  }

  /** POST /rules/:id/apply: re-categorizes the matching transactions still in triage. */
  async apply(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(ruleParamsValidator)

    const result = await this.rules.apply(ctx.household, ctx.auth.getUserOrFail(), params.id)

    return { data: result }
  }
}
