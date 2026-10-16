import type User from '#models/user'
import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import { TagNotFound } from '#exceptions/errors'
import { postingsFor } from '#domain/ledger/privacy'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import PostingsRepository from '#repositories/postings_repository'
import { tagDetail, tagTotals, type TagRange } from '#domain/reports/tag_summary'

/**
 * Per-tag reports: the tagged postings of the household (any date), masked
 * for the reader (a partner's private row never shows its tags), handed to
 * the pure functions of app/domain/reports/tag_summary.ts with the range.
 */
@inject()
export default class TagReportService {
  constructor(protected postings: PostingsRepository) {}

  /** Every tag the reader can see, with its totals in `range`, most recently used first. */
  async index(household: Household, viewer: User, range: TagRange = {}) {
    const postings = postingsFor(
      await this.postings.tagged(household),
      await privacyViewer(household, viewer)
    )
    return tagTotals(postings, range)
  }

  /** One tag in `range`; 404 when the reader can see no transaction carrying it. */
  async show(household: Household, viewer: User, tag: string, range: TagRange = {}) {
    const postings = postingsFor(
      await this.postings.tagged(household, { tag }),
      await privacyViewer(household, viewer)
    )
    const detail = tagDetail(postings, tag, range)
    if (!detail) throw new TagNotFound()
    return detail
  }
}
