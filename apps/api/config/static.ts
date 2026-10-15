import { relative } from 'node:path'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/static'
import { cacheHeadersFor } from '#services/static_cache_policy'

/**
 * Serves `public/` (the Angular build inside the Docker image). Caching per
 * file is decided by `cacheHeadersFor`: the PWA control files are never
 * cached and hashed bundles are immutable.
 */
const staticServerConfig = defineConfig({
  enabled: true,
  etag: true,
  lastModified: true,
  dotFiles: 'ignore',
  headers: (path) => cacheHeadersFor(relative(app.publicPath(), path)),
})

export default staticServerConfig
