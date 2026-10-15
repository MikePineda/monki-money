import { Readable } from 'node:stream'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import HouseholdPolicy from '#policies/household_policy'
import MemberTransformer from '#transformers/member_transformer'
import HouseholdService from '#services/households/household_service'
import HouseholdTransformer from '#transformers/household_transformer'
import HouseholdExporter from '#services/households/household_exporter'
import {
  deleteHouseholdValidator,
  exportHouseholdValidator,
  updateHouseholdValidator,
} from '#validators/household'

@inject()
export default class HouseholdController {
  constructor(
    protected households: HouseholdService,
    protected exporter: HouseholdExporter
  ) {}

  /** GET /household */
  async show(ctx: HttpContext) {
    return ctx.serialize(HouseholdTransformer.transform(ctx.household))
  }

  /** PATCH /household (owner) */
  async update(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateHouseholdValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('update', ctx.membership)

    const household = await this.households.update(ctx.household, payload)

    return ctx.serialize(HouseholdTransformer.transform(household))
  }

  /** GET /household/members */
  async members(ctx: HttpContext) {
    const members = await this.households.members(ctx.household)
    return ctx.serialize(MemberTransformer.transform(members))
  }

  /** GET /household/export (owner): streamed JSON download. */
  async export(ctx: HttpContext) {
    await ctx.request.validateUsing(exportHouseholdValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('export', ctx.membership)

    const date = new Date().toISOString().slice(0, 10)
    ctx.response.header('Content-Type', 'application/json; charset=utf-8')
    ctx.response.header(
      'Content-Disposition',
      `attachment; filename="monkimoney-export-${date}.json"`
    )
    ctx.response.header('Cache-Control', 'no-store')
    ctx.response.stream(Readable.from(this.exporter.json(ctx.household)))
  }

  /** POST /household/delete (owner, password): schedules the deletion. */
  async destroy(ctx: HttpContext) {
    const { password } = await ctx.request.validateUsing(deleteHouseholdValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('delete', ctx.membership)

    const household = await this.households.scheduleDeletion(
      ctx.household,
      ctx.auth.getUserOrFail(),
      password
    )

    return ctx.serialize(HouseholdTransformer.transform(household))
  }

  /** POST /household/restore (owner): within the 30-day window. */
  async restore(ctx: HttpContext) {
    await ctx.bouncer.with(HouseholdPolicy).authorize('delete', ctx.membership)

    const household = await this.households.restore(ctx.household)

    return ctx.serialize(HouseholdTransformer.transform(household))
  }
}
