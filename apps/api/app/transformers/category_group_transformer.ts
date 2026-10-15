import type { I18n } from '@adonisjs/i18n'
import type CategoryGroup from '#models/category_group'
import { BaseTransformer } from '@adonisjs/core/transformers'

/**
 * A category group (no categories). System groups are named in the reader's
 * locale (`categories.group.<slug>`).
 */
export default class CategoryGroupTransformer extends BaseTransformer<CategoryGroup> {
  constructor(
    resource: CategoryGroup,
    protected i18n?: I18n
  ) {
    super(resource)
  }

  toObject() {
    const { slug, name, isSystem } = this.resource
    return {
      id: this.resource.id,
      slug,
      name: isSystem && this.i18n ? this.i18n.t(`categories.group.${slug}`, {}, name) : name,
      kind: this.resource.kind,
      sortOrder: this.resource.sortOrder,
      isHidden: this.resource.isHidden,
      isSystem,
    }
  }
}
