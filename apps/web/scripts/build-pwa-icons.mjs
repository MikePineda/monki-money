#!/usr/bin/env node
/**
 * Rasterises the placeholder brand mark (scripts/brand/*.svg) into the PWA
 * icon set under public/icons. Needs `rsvg-convert` (librsvg) on the PATH:
 * `brew install librsvg`. The output PNGs are committed, so this only runs
 * when the mark changes.
 *
 *   node scripts/build-pwa-icons.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const brand = join(root, 'scripts', 'brand')
const out = join(root, 'public', 'icons')

const targets = [
  { source: 'mark-any.svg', size: 192, file: 'icon-192.png' },
  { source: 'mark-any.svg', size: 512, file: 'icon-512.png' },
  { source: 'mark-maskable.svg', size: 192, file: 'icon-maskable-192.png' },
  { source: 'mark-maskable.svg', size: 512, file: 'icon-maskable-512.png' },
  // iOS rounds the corners itself and shows transparency as black.
  { source: 'mark-maskable.svg', size: 180, file: 'apple-touch-icon.png' },
  { source: 'mark-any.svg', size: 32, file: 'favicon-32.png' },
]

mkdirSync(out, { recursive: true })
for (const { source, size, file } of targets) {
  execFileSync('rsvg-convert', [
    '--width',
    String(size),
    '--height',
    String(size),
    '--output',
    join(out, file),
    join(brand, source),
  ])
  console.log(`icons/${file} (${size}px)`)
}
