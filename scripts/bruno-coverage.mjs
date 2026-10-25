#!/usr/bin/env node
/**
 * Bruno coverage check: every API route has a request in apps/api/bruno, so
 * the collection (the living API docs) cannot drift from the API silently.
 *
 *   node scripts/bruno-coverage.mjs                    # npm run bruno:coverage
 *   node scripts/bruno-coverage.mjs --scaffold <dir>   # also write a skeleton .bru per uncovered route
 *
 * Routes come from the generated Tuyau registry
 * (apps/api/.adonisjs/client/registry/index.ts: name, methods, pattern), read
 * as text: no app boot, no database. Requests come from every .bru file of
 * the collection (method block + url). A request covers a route when the
 * methods match and every path segment matches: a literal segment equals the
 * route's static segment (or fills a parameter), a `{{var}}` segment fills a
 * parameter. The most specific route wins (`/transactions/suggestions` is
 * `transactions.suggestions`, not `transactions.show`).
 *
 * Fails (exit 1) when:
 *   - a route outside ALLOWLIST has no request;
 *   - a request matches no route (renamed or removed route, typo in a url);
 *   - an ALLOWLIST entry is stale (the route is gone, or a request covers it).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registryFile = path.join(root, 'apps/api/.adonisjs/client/registry/index.ts')
const collectionDir = path.join(root, 'apps/api/bruno')

/**
 * Routes with no request on purpose, each with its reason. Routes outside the
 * registry need no entry: the SPA fallback (`spa.fallback`) and the
 * test-support routes (`e2e.reset`, `e2e.outbox`) are excluded from it in
 * apps/api/adonisrc.ts, so this check never sees them.
 */
const ALLOWLIST = {
  'auth.password.reset':
    'needs the single-use token from the reset mail; a made-up token only burns the per-IP failure budget (5/min)',
  'auth.invitations.show':
    'needs the token from the invitation mail; failed lookups count toward the per-IP brute-force limit (5/min)',
  'auth.invitations.accept':
    'needs the token from the invitation mail (and creates a member); failures count toward the per-IP limit',
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

function readRoutes() {
  const source = fs.readFileSync(registryFile, 'utf8')
  const pattern = /^\s*'([^']+)': \{\s*\n\s*methods: (\[[^\]]*\]),\s*\n\s*pattern: '([^']+)'/gm
  const routes = []
  for (const match of source.matchAll(pattern)) {
    const methods = JSON.parse(match[2]).filter((method) => method !== 'HEAD')
    routes.push({ name: match[1], methods, pattern: match[3], segments: splitPath(match[3]) })
  }
  if (routes.length === 0) {
    throw new Error(
      `no routes found in ${path.relative(root, registryFile)}: did its format change?`
    )
  }
  return routes
}

function splitPath(value) {
  return value.split('/').filter(Boolean)
}

function bruFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return ['environments', 'node_modules', '.git'].includes(entry.name) ? [] : bruFiles(full)
    }
    return entry.name.endsWith('.bru') && !['collection.bru', 'folder.bru'].includes(entry.name)
      ? [full]
      : []
  })
}

function readRequest(file) {
  const source = fs.readFileSync(file, 'utf8')
  const block = source.match(new RegExp(`^(${METHODS.join('|')}) \\{\\s*\\n\\s*url: (.*)$`, 'm'))
  if (!block) return null
  const url = block[2]
    .trim()
    .replace(/^\{\{baseUrl\}\}/, '')
    .split('?')[0]
  return { file: path.relative(root, file), method: block[1].toUpperCase(), url }
}

/** Specificity of `request` against `route` (static segments matched), or -1. */
function score(route, request) {
  if (!route.methods.includes(request.method)) return -1
  const segments = splitPath(request.url)
  if (segments.length !== route.segments.length) return -1
  let statics = 0
  for (const [index, expected] of route.segments.entries()) {
    const actual = segments[index]
    const isParam = expected.startsWith(':') || expected === '*'
    const isVariable = actual.includes('{{')
    if (isParam) continue
    if (isVariable || actual !== expected) return -1
    statics += 1
  }
  return statics
}

function bestRoute(routes, request) {
  let best = null
  let bestScore = -1
  for (const route of routes) {
    const value = score(route, request)
    if (value > bestScore) {
      best = route
      bestScore = value
    }
  }
  return best
}

function skeleton(route) {
  const method = route.methods[0].toLowerCase()
  const url = route.pattern.replace(/:(\w+)/g, (_, name) => `{{${name}}}`)
  const hasBody = ['post', 'put', 'patch'].includes(method)
  return `meta {
  name: ${route.name}
  type: http
  seq: 1
}

${method} {
  url: {{baseUrl}}${url}
  body: ${hasBody ? 'json' : 'none'}
  auth: none
}
${hasBody ? '\nbody:json {\n  {}\n}\n' : ''}
assert {
  res.status: eq 200
}

docs {
  \`${route.name}\`: TODO what it takes and returns (copy from docs/CONTRACTS.md).
}
`
}

function main() {
  const args = process.argv.slice(2)
  const scaffoldIndex = args.indexOf('--scaffold')
  const scaffoldDir = scaffoldIndex === -1 ? null : args[scaffoldIndex + 1]
  if (scaffoldIndex !== -1 && !scaffoldDir) {
    console.error('usage: node scripts/bruno-coverage.mjs [--scaffold <dir>]')
    process.exit(2)
  }

  const routes = readRoutes()
  const requests = bruFiles(collectionDir).map(readRequest).filter(Boolean)
  const coveredBy = new Map(routes.map((route) => [route.name, []]))
  const orphans = []

  for (const request of requests) {
    const route = bestRoute(routes, request)
    if (route) coveredBy.get(route.name).push(request.file)
    else orphans.push(request)
  }

  const uncovered = routes.filter(
    (route) => coveredBy.get(route.name).length === 0 && !(route.name in ALLOWLIST)
  )
  const routeNames = new Set(routes.map((route) => route.name))
  const stale = Object.keys(ALLOWLIST).filter(
    (name) => !routeNames.has(name) || coveredBy.get(name).length > 0
  )
  const covered = routes.filter((route) => coveredBy.get(route.name).length > 0).length

  console.log(
    `bruno coverage: ${covered}/${routes.length} routes covered by ${requests.length} requests, ` +
      `${Object.keys(ALLOWLIST).length} allowlisted`
  )
  for (const [name, reason] of Object.entries(ALLOWLIST)) {
    console.log(`  allowlisted  ${name}: ${reason}`)
  }
  for (const route of uncovered) {
    console.log(`  UNCOVERED    ${route.name}  ${route.methods.join('|')} ${route.pattern}`)
  }
  for (const request of orphans) {
    console.log(`  NO ROUTE     ${request.file}  ${request.method} ${request.url}`)
  }
  for (const name of stale) {
    const why = routeNames.has(name) ? 'a request covers it now' : 'no such route'
    console.log(`  STALE        allowlist entry ${name}: ${why}`)
  }

  if (scaffoldDir && uncovered.length > 0) {
    const target = path.resolve(process.cwd(), scaffoldDir)
    fs.mkdirSync(target, { recursive: true })
    for (const route of uncovered) {
      const file = path.join(target, `${route.name}.bru`)
      if (fs.existsSync(file)) {
        console.log(`  kept         ${path.relative(process.cwd(), file)} (already there)`)
        continue
      }
      fs.writeFileSync(file, skeleton(route))
      console.log(`  scaffolded   ${path.relative(process.cwd(), file)}`)
    }
  }

  if (uncovered.length > 0 || orphans.length > 0 || stale.length > 0) {
    console.error(
      '\nbruno coverage failed: add a request for each uncovered route (see apps/api/bruno/README.md;' +
        ' --scaffold <dir> writes skeletons), fix the requests that match no route, or update the allowlist' +
        ' in scripts/bruno-coverage.mjs.'
    )
    process.exit(1)
  }
}

main()
