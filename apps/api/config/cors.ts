import { defineConfig } from '@adonisjs/cors'

/**
 * CORS is disabled on purpose, in every environment: the API serves the SPA
 * from the same origin in production, and `ng serve` proxies `/api` in
 * development (apps/web/proxy.conf.json). Same origin is also what lets the
 * httpOnly session cookie work without SameSite=None.
 */
const corsConfig = defineConfig({
  enabled: false,
  origin: [],
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  headers: true,
  exposeHeaders: [],
  credentials: false,
  maxAge: 90,
})

export default corsConfig
