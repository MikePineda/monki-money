import vine from '@vinejs/vine'
import { CATEGORY_GROUP_KINDS } from '@monkimoney/shared'
import { id, idParams } from '#validators/rules'

const name = () => vine.string().trim().minLength(1).maxLength(80)
const icon = () =>
  vine
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,40}$/)
    .nullable()

export const listCategoriesValidator = vine.create({
  /** `?tree=1`: groups with their categories nested. */
  tree: vine.boolean().optional(),
})

export const createCategoryValidator = vine.create({
  categoryGroupId: id(),
  name: name(),
  icon: icon().optional(),
  isHidden: vine.boolean().optional(),
})

export const updateCategoryValidator = vine.create({
  params: idParams(),
  categoryGroupId: id().optional(),
  name: name().optional(),
  icon: icon().optional(),
  isHidden: vine.boolean().optional(),
})

export const deleteCategoryValidator = vine.create({
  params: idParams(),
  reassignToCategoryId: id().optional(),
})

export const createCategoryGroupValidator = vine.create({
  name: name(),
  kind: vine.enum(CATEGORY_GROUP_KINDS).optional(),
})

export const updateCategoryGroupValidator = vine.create({
  params: idParams(),
  name: name().optional(),
  isHidden: vine.boolean().optional(),
})

export const categoryGroupParamsValidator = vine.create({
  params: idParams(),
})
