import type { I18n } from '@adonisjs/i18n'
import type CategoryGroup from '#models/category_group'
import { BaseTransformer } from '@adonisjs/core/transformers'
import CategoryTransformer from '#transformers/category_transformer'
import CategoryGroupTransformer from '#transformers/category_group_transformer'

/** A group with its categories nested (needs `categories` preloaded): `?tree=1`. */
export default class CategoryTreeTransformer extends BaseTransformer<CategoryGroup> {
  constructor(
    resource: CategoryGroup,
    protected i18n?: I18n
  ) {
    super(resource)
  }

  toObject() {
    return {
      ...new CategoryGroupTransformer(this.resource, this.i18n).toObject(),
      categories: CategoryTransformer.transform(this.resource.categories, this.i18n),
    }
  }
}
