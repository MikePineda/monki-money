import { Injectable, inject } from '@angular/core'
import { API } from '../api/api'
import type { CategoryTree } from '../api/api-types'

/** Data access for the household's categories, read as a tree of groups. */
@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly api = inject(API)

  /** `GET /categories?tree=1`: groups in their order, each with its categories. */
  async tree(): Promise<CategoryTree[]> {
    const { data } = await (await this.api()).request('categories.index', { query: { tree: true } })
    return data as CategoryTree[]
  }
}
