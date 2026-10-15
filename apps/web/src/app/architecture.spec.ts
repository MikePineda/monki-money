import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

/**
 * Layer rules for src/app (plan, "Convenciones para agentes"):
 * - domain/ is pure TypeScript: no Angular, no RxJS, nothing outside domain/
 *   except the DOM-free math packages listed in DOMAIN_PACKAGES;
 * - d3 stays behind domain/charts, so the charts chunk is the only one that
 *   carries it, and the eager app (core, layouts, shared/ui) never pulls in
 *   charts at all;
 * - only core/api/ talks to Tuyau (@tuyau/core and the API registry);
 * - features never import one another;
 * - shared/ never reaches into features/, layouts/ or core/;
 * - colours are tokens: no hex literal anywhere but src/styles.css.
 */
const appRoot = join(process.cwd(), 'src/app')

/** Pure, DOM-free packages domain/ may import (chart scales and paths). */
const DOMAIN_PACKAGES = ['d3-scale', 'd3-shape']

interface SourceFile {
  path: string
  rel: string
  imports: string[]
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const IMPORT =
  /(?:import|export)\s[^'"`]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

const sources: SourceFile[] = walk(appRoot)
  .filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'))
  .map((path) => {
    const text = readFileSync(path, 'utf8')
    const imports = [...text.matchAll(IMPORT)].map((match) => match[1] ?? match[2])
    return { path, rel: relative(appRoot, path).split(sep).join('/'), imports }
  })

/** For relative imports, the target path relative to src/app ('' for packages). */
function target(file: SourceFile, specifier: string): string {
  if (!specifier.startsWith('.')) {
    return ''
  }
  return relative(appRoot, resolve(dirname(file.path), specifier))
    .split(sep)
    .join('/')
}

function violations(predicate: (file: SourceFile, specifier: string) => boolean): string[] {
  return sources.flatMap((file) =>
    file.imports
      .filter((specifier) => predicate(file, specifier))
      .map((specifier) => `${file.rel} -> ${specifier}`)
  )
}

describe('architecture', () => {
  it('test_scans_the_app_sources', () => {
    expect(sources.length).toBeGreaterThan(20)
    expect(sources.some((file) => file.rel.startsWith('domain/'))).toBe(true)
  })

  it('test_domain_is_pure_typescript_without_angular_or_rxjs', () => {
    const bad = violations(
      (file, specifier) =>
        file.rel.startsWith('domain/') &&
        (specifier.startsWith('@angular/') || specifier.startsWith('rxjs'))
    )
    expect(bad).toEqual([])
  })

  it('test_domain_imports_nothing_outside_domain', () => {
    const bad = violations((file, specifier) => {
      if (!file.rel.startsWith('domain/')) {
        return false
      }
      if (!specifier.startsWith('.')) {
        return !DOMAIN_PACKAGES.includes(specifier)
      }
      return !target(file, specifier).startsWith('domain/')
    })
    expect(bad).toEqual([])
  })

  it('test_d3_is_only_imported_by_domain_charts', () => {
    const bad = violations(
      (file, specifier) => specifier.startsWith('d3') && !file.rel.startsWith('domain/charts/')
    )
    expect(bad).toEqual([])
  })

  it('test_the_eager_app_never_imports_charts', () => {
    const bad = violations((file, specifier) => {
      if (
        !/^(core|layouts|shared\/ui|shared\/icons)\//.test(file.rel) &&
        !/^app\./.test(file.rel)
      ) {
        return false
      }
      return /^(shared\/charts|domain\/charts)\//.test(target(file, specifier))
    })
    expect(bad).toEqual([])
  })

  it('test_only_core_api_talks_to_tuyau', () => {
    const bad = violations(
      (file, specifier) =>
        !file.rel.startsWith('core/api/') &&
        (specifier.startsWith('@tuyau/') || specifier.startsWith('@monkimoney/api'))
    )
    expect(bad).toEqual([])
  })

  it('test_features_never_import_each_other', () => {
    const featureOf = (path: string) => /^features\/([^/]+)\//.exec(path)?.[1]
    const bad = violations((file, specifier) => {
      const own = featureOf(file.rel)
      const other = featureOf(target(file, specifier))
      return own !== undefined && other !== undefined && own !== other
    })
    expect(bad).toEqual([])
  })

  it('test_shared_does_not_depend_on_features_layouts_or_core', () => {
    const bad = violations((file, specifier) => {
      if (!file.rel.startsWith('shared/')) {
        return false
      }
      return /^(features|layouts|core)\//.test(target(file, specifier))
    })
    expect(bad).toEqual([])
  })

  it('test_no_hex_colour_outside_styles_css', () => {
    const hex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/
    const offenders = walk(appRoot)
      .filter((path) => /\.(ts|html|scss|css)$/.test(path) && !path.endsWith('.spec.ts'))
      .filter((path) => hex.test(readFileSync(path, 'utf8')))
      .map((path) => relative(appRoot, path))
    expect(offenders).toEqual([])
  })
})
