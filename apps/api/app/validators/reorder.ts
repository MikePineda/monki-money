import vine from '@vinejs/vine'
import { id } from '#validators/rules'

/** `PUT /<resource>/reorder { ids }`: the new order, first = top. */
export const reorderValidator = vine.create({
  ids: vine.array(id()).minLength(1).maxLength(500).distinct(),
})
