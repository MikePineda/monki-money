import proxyAddr from 'proxy-addr'

/**
 * Peers allowed to tell us the client IP: Traefik on the Docker network
 * (private range) and loopback (local runs, tests). Same list as
 * `trustProxy` in config/app.ts.
 */
const isLocalProxy = proxyAddr.compile(['loopback', 'uniquelocal'])

interface ClientIpContext {
  request: {
    header(name: string): string | undefined | null
    ip(): string
    request: { socket: { remoteAddress?: string } }
  }
}

/**
 * The one way to read the client's IP (rate limits, audit logs).
 *
 * Production traffic is Cloudflare -> Traefik -> app. Traefik only accepts
 * Cloudflare's ranges (`cf-only@file`), and Cloudflare overwrites
 * `CF-Connecting-IP` on every request, so the header is the real client
 * when the TCP peer is that local proxy. A request reaching the app from
 * anywhere else (public peer) could forge the header, so it is ignored and
 * `request.ip()` (X-Forwarded-For honoured only from trusted proxies) wins.
 *
 * The peer is checked on the socket, not on `request.ip()`: behind Traefik,
 * `request.ip()` resolves to Cloudflare's edge address, shared by many users.
 */
export function clientIp(ctx: ClientIpContext): string {
  const peer = ctx.request.request.socket.remoteAddress
  const cloudflare = ctx.request.header('cf-connecting-ip')?.trim()

  if (cloudflare && peer && isLocalProxy(peer, 0)) return cloudflare
  return ctx.request.ip()
}
