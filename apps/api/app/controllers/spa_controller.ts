import { existsSync } from 'node:fs'
import { isApiPath } from '@monkimoney/shared'
import app from '@adonisjs/core/services/app'
import { errors, type HttpContext } from '@adonisjs/core/http'

/**
 * Serves the Angular shell for every client-side route (/month, /add...).
 * Real files (bundles, icons, the service worker) are answered earlier by
 * the static middleware; this only runs when no file matched.
 */
export default class SpaController {
  async show({ request, response }: HttpContext) {
    // An unknown API route must stay a JSON 404, never the HTML shell.
    if (isApiPath(request.url())) {
      throw new errors.E_ROUTE_NOT_FOUND([request.method(), request.url()])
    }

    const indexPath = app.publicPath('index.html')
    if (!existsSync(indexPath)) {
      // Development: the SPA is served by `ng serve` on :4200, not by the API.
      throw new errors.E_ROUTE_NOT_FOUND([request.method(), request.url()])
    }

    response.header('Cache-Control', 'no-cache')
    response.header('CDN-Cache-Control', 'no-store')
    return response.download(indexPath)
  }
}
