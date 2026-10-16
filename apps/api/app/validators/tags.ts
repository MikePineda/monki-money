import vine from '@vinejs/vine'
import { isoDate } from '#validators/rules'
import { tag } from '#validators/transactions'

/** An optional calendar range ('YYYY-MM-DD', inclusive); either end may stay open. */
const range = {
  from: isoDate().optional(),
  to: isoDate().optional(),
}

/** `GET /tags?from=&to=` */
export const tagsIndexValidator = vine.create({ ...range })

/** `GET /tags/:tag?from=&to=`: the tag arrives URL-decoded and follows the form's rule. */
export const tagShowValidator = vine.create({
  params: vine.object({ tag: tag() }),
  ...range,
})
