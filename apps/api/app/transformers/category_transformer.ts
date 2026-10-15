import type { I18n } from '@adonisjs/i18n'
import type Category from '#models/category'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * A category. System categories are named in the reader's locale
 * (`categories.<slug>`); custom ones keep the name as typed.
 */
export default class CategoryTransformer extends BaseTransformer<Category> {
  constructor(
    resource: Category,
    protected i18n?: I18n
  ) {
    super(resource)
  }

  toObject() {
    const { slug, name, isSystem } = this.resource
    return {
      id: this.resource.id,
      categoryGroupId: this.resource.categoryGroupId,
      slug,
      name: isSystem && this.i18n ? this.i18n.t(`categories.${slug}`, {}, name) : name,
      icon: this.resource.icon,
      sortOrder: this.resource.sortOrder,
      isHidden: this.resource.isHidden,
      isSystem,
    }
  }
}
