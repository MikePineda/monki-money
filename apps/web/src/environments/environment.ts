/**
 * Build-time flags only. There is deliberately no API URL: the SPA is always
 * served by the API itself (same origin), and in development `ng serve`
 * proxies `/api` to the local API (see proxy.conf.json).
 */
export const environment = {
  production: true,
}
