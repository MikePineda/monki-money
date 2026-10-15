import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import UploadService from '#services/uploads/upload_service'
import { presignUploadValidator } from '#validators/uploads'

/** Direct uploads to the private bucket (any member of the household). */
@inject()
export default class UploadsController {
  constructor(protected uploads: UploadService) {}

  /**
   * POST /uploads/presign (`{ kind, contentType, byteSize }`): 201 with a
   * server-chosen key and a PUT URL valid for 5 minutes.
   */
  async presign(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(presignUploadValidator)

    const upload = await this.uploads.presign(ctx.household, payload)

    ctx.response.status(201)
    return { data: upload }
  }
}
