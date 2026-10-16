import { Readable } from 'node:stream'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import HouseholdPolicy from '#policies/household_policy'
import { authAttempts, throttleKey } from '#services/auth/throttles'
import MemberTransformer from '#transformers/member_transformer'
import HouseholdService from '#services/households/household_service'
import HouseholdTransformer from '#transformers/household_transformer'
import HouseholdExporter from '#services/households/household_exporter'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import {
  deleteHouseholdValidator,
  exportHouseholdValidator,
  transferOwnershipValidator,
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

  /**
   * GET /household/export?format=json|csv (owner): streamed download of
   * every table of the household. JSON: one object, one array per table;
   * CSV: a zip with one CSV per table plus the readable ledger.
   */
  async export(ctx: HttpContext) {
    const { format } = await ctx.request.validateUsing(exportHouseholdValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('export', ctx.membership)
    const viewer = await privacyViewer(ctx.household, ctx.auth.getUserOrFail())

    const date = new Date().toISOString().slice(0, 10)
    ctx.response.header('Cache-Control', 'no-store')

    if (format === 'csv') {
      ctx.response.header('Content-Type', 'application/zip')
      ctx.response.header(
        'Content-Disposition',
        `attachment; filename="monkimoney-export-${date}.zip"`
      )
      ctx.response.stream(Readable.from(this.exporter.zip(ctx.household, viewer, ctx.i18n)))
      return
    }

    ctx.response.header('Content-Type', 'application/json; charset=utf-8')
    ctx.response.header(
      'Content-Disposition',
      `attachment; filename="monkimoney-export-${date}.json"`
    )
    ctx.response.stream(Readable.from(this.exporter.json(ctx.household, viewer)))
  }

  /**
   * POST /household/leave (members only; owners get 422
   * E_OWNER_CANNOT_LEAVE): drops the caller's membership and keeps their
   * session and ledger rows.
   */
  async leave(ctx: HttpContext) {
    await this.households.leave(ctx.membership, ctx.auth.getUserOrFail())
    return ctx.response.noContent()
  }

  /**
   * POST /household/transfer-ownership (owner, password): another member
   * becomes the owner and the caller a member. Wrong passwords count toward
   * the same per-user limit as PATCH /me and the household delete.
   */
  async transferOwnership(ctx: HttpContext) {
    const { userId, password } = await ctx.request.validateUsing(transferOwnershipValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('transferOwnership', ctx.membership)

    const owner = ctx.auth.getUserOrFail()
    const [throttled, members] = await authAttempts().penalize(
      throttleKey('password', owner.id),
      () => this.households.transferOwnership(ctx.household, owner, userId, password)
    )
    if (throttled) throw throttled

    return ctx.serialize(MemberTransformer.transform(members))
  }

  /**
   * POST /household/delete (owner, password): schedules the deletion. Wrong
   * passwords count toward the same per-user limit as PATCH /me.
   */
  async destroy(ctx: HttpContext) {
    const { password } = await ctx.request.validateUsing(deleteHouseholdValidator)
    await ctx.bouncer.with(HouseholdPolicy).authorize('delete', ctx.membership)

    const owner = ctx.auth.getUserOrFail()
    const [throttled, household] = await authAttempts().penalize(
      throttleKey('password', owner.id),
      () => this.households.scheduleDeletion(ctx.household, owner, password)
    )
    if (throttled) throw throttled

    return ctx.serialize(HouseholdTransformer.transform(household))
  }

  /** POST /household/restore (owner): within the 30-day window. */
  async restore(ctx: HttpContext) {
    await ctx.bouncer.with(HouseholdPolicy).authorize('delete', ctx.membership)

    const household = await this.households.restore(ctx.household)

    return ctx.serialize(HouseholdTransformer.transform(household))
  }
}
