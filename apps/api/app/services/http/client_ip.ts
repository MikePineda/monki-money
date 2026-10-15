/**
 * The one way to read the client's IP (rate limits, audit logs).
 *
 * Production traffic is Cloudflare -> Traefik -> app, and Traefik only
 * accepts Cloudflare's ranges, so `CF-Connecting-IP` (overwritten by
 * Cloudflare on every request) is the real client. Without it (local, CI)
 * we fall back to `request.ip()`, which honours X-Forwarded-For only from
 * the trusted proxies of config/app.ts. An arbitrary X-Forwarded-For sent by
 * a client never wins over CF-Connecting-IP.
 */
export function clientIp(ctx: {
  request: { header(name: string): string | undefined | null; ip(): string }
}): string {
  const cloudflare = ctx.request.header('cf-connecting-ip')?.trim()
  return cloudflare || ctx.request.ip()
}
