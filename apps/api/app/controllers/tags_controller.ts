import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import TagEditor from '#services/ledger/tag_editor'
import TagReportService from '#services/reports/tag_report_service'
import { renameTagValidator, tagShowValidator, tagsIndexValidator } from '#validators/tags'

/**
 * Free tags on transactions (a trip, an event) and what they add up to.
 * Amounts are positive on their own side; transfers never count as
 * spending or income, but a tagged transfer into a savings account is
 * money set aside (`setAsideCents`).
 */
@inject()
export default class TagsController {
  constructor(
    protected tags: TagReportService,
    protected editor: TagEditor
  ) {}

  /** GET /tags?from=&to=: every tag in use with its totals, most recently used first. */
  async index(ctx: HttpContext) {
    const range = await ctx.request.validateUsing(tagsIndexValidator)

    const tags = await this.tags.index(ctx.household, ctx.auth.getUserOrFail(), range)

    return { data: tags }
  }

  /** GET /tags/:tag?from=&to= (URL-encoded tag): totals by category, month and person. */
  async show(ctx: HttpContext) {
    const { params, ...range } = await ctx.request.validateUsing(tagShowValidator)

    const detail = await this.tags.show(ctx.household, ctx.auth.getUserOrFail(), params.tag, range)

    return { data: detail }
  }

  /**
   * PATCH /tags/:tag { name }: renames the tag on every transaction the
   * reader can see (an existing name merges the two): `{ tag, updated }`.
   */
  async update(ctx: HttpContext) {
    const { params, name } = await ctx.request.validateUsing(renameTagValidator)

    const result = await this.editor.rename(
      ctx.household,
      ctx.auth.getUserOrFail(),
      params.tag,
      name
    )

    return { data: result }
  }
}
