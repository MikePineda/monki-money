import { Injectable, inject } from '@angular/core'
import { API } from '../api/api'

/** Calendar dates ('YYYY-MM-DD', inclusive); either end may stay open. */
export interface TagRange {
  from?: string
  to?: string
}

/**
 * Data access for the household's free tags (a trip, an event) and what
 * they add up to. Amounts are positive on their own side; transfers never
 * count as spending, but a tagged transfer into a savings account is money
 * set aside. A partner's private rows never show under a tag.
 */
@Injectable({ providedIn: 'root' })
export class TagsApi {
  private readonly api = inject(API)

  /** `GET /tags`: every tag with its totals, most recently used first. */
  async list(range: TagRange = {}) {
    const { data } = await (await this.api()).request('tags.index', { query: range })
    return data
  }

  /** `GET /tags/:tag`: one tag by category, month and person (404 when nobody uses it). */
  async show(tag: string, range: TagRange = {}) {
    const { data } = await (
      await this.api()
    ).request('tags.show', { params: { tag }, query: range })
    return data
  }
}

/** One tag of `GET /tags`. */
export type TagSummary = Awaited<ReturnType<TagsApi['list']>>[number]
/** `GET /tags/:tag`. */
export type TagDetail = Awaited<ReturnType<TagsApi['show']>>
