import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guards the static PWA configuration: the manifest that makes the app
 * installable and the service-worker config that must never cache API data.
 */
const webRoot = process.cwd()
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(webRoot, path), 'utf8')) as T

interface ManifestIcon {
  src: string
  sizes: string
  purpose?: string
}

interface Manifest {
  display: string
  start_url: string
  theme_color: string
  background_color: string
  icons: ManifestIcon[]
  shortcuts?: { name: string; url: string }[]
}

interface NgswConfig {
  navigationUrls: string[]
  assetGroups: { name: string; resources: { files: string[] } }[]
  dataGroups?: { urls: string[] }[]
}

describe('web app manifest', () => {
  const manifest = readJson<Manifest>('public/manifest.webmanifest')

  it('test_manifest_opens_standalone_on_the_month_view', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/month')
  })

  it('test_manifest_colours_match_the_light_page_surface', () => {
    const styles = readFileSync(join(webRoot, 'src/styles.css'), 'utf8')
    const surface0 = /--surface-0:\s*(#[0-9a-f]{6});/.exec(styles)?.[1]

    expect(surface0).toBeDefined()
    expect(manifest.theme_color).toBe(surface0)
    expect(manifest.background_color).toBe(surface0)
  })

  it('test_manifest_has_a_quick_expense_shortcut', () => {
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toContain('/add?type=expense')
  })

  it('test_manifest_ships_any_and_maskable_icons_that_exist_on_disk', () => {
    const purposes = manifest.icons.map((icon) => icon.purpose ?? 'any')

    expect(purposes).toContain('any')
    expect(purposes).toContain('maskable')
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true)
    for (const icon of manifest.icons) {
      expect(existsSync(join(webRoot, 'public', icon.src)), icon.src).toBe(true)
    }
  })

  it('test_apple_touch_icon_exists', () => {
    expect(existsSync(join(webRoot, 'public/icons/apple-touch-icon.png'))).toBe(true)
  })
})

describe('service worker config', () => {
  const config = readJson<NgswConfig>('ngsw-config.json')

  it('test_service_worker_never_caches_api_responses', () => {
    const dataUrls = (config.dataGroups ?? []).flatMap((group) => group.urls)

    expect(dataUrls.filter((url) => url.startsWith('/api'))).toEqual([])
  })

  it('test_api_urls_are_never_served_the_app_shell', () => {
    expect(config.navigationUrls).toContain('!/api/**')
  })

  it('test_service_worker_prefetches_the_shell_catalogs_font_and_icons', () => {
    const app = config.assetGroups.find((group) => group.name === 'app')
    const files = app?.resources.files ?? []

    expect(files).toContain('/index.html')
    expect(files).toContain('/i18n/*.json')
    expect(files).toContain('/theme-boot.js')
    expect(files).toContain('/fonts/*.woff2')
    expect(files).toContain('/sprite/*.svg')
  })
})

describe('index.html', () => {
  const html = readFileSync(join(webRoot, 'src/index.html'), 'utf8')

  it('test_theme_boot_script_is_external_and_runs_before_the_app', () => {
    expect(html).toContain('<script src="theme-boot.js"></script>')
    expect(html).not.toMatch(/<script>(?!<\/script>)/)
    expect(html.indexOf('theme-boot.js')).toBeLessThan(html.indexOf('<app-root>'))
  })

  it('test_theme_color_is_declared_for_both_schemes', () => {
    expect(html).toMatch(/name="theme-color"[\s\S]*?data-scheme="light"/)
    expect(html).toMatch(/name="theme-color"[\s\S]*?data-scheme="dark"/)
  })
})
