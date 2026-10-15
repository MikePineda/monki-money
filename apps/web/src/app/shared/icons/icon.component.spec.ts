import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TestBed } from '@angular/core/testing'
import { IconComponent } from './icon.component'
import { ICON_NAMES } from './icon-names'

describe('IconComponent', () => {
  it('test_references_the_named_symbol_in_the_sprite', async () => {
    const fixture = TestBed.createComponent(IconComponent)
    fixture.componentRef.setInput('name', 'calendar')
    await fixture.whenStable()

    const svg = fixture.nativeElement.querySelector('svg') as SVGElement
    expect(svg.querySelector('use')?.getAttribute('href')).toBe('/sprite/lucide.svg#calendar')
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('stroke-width')).toBe('1.75')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('test_sizes_to_16_or_24_when_asked', async () => {
    const fixture = TestBed.createComponent(IconComponent)
    fixture.componentRef.setInput('name', 'plus')
    fixture.componentRef.setInput('size', 24)
    await fixture.whenStable()

    expect(fixture.nativeElement.querySelector('svg').getAttribute('height')).toBe('24')
  })
})

describe('icon sprite', () => {
  const sprite = readFileSync(join(process.cwd(), 'public/sprite/lucide.svg'), 'utf8')

  it('test_every_icon_name_has_a_symbol_in_the_committed_sprite', () => {
    const missing = ICON_NAMES.filter((name) => !sprite.includes(`<symbol id="${name}"`))

    expect(missing).toEqual([])
  })

  it('test_symbols_inherit_stroke_from_the_referencing_svg', () => {
    expect(sprite).not.toMatch(/stroke-width=/)
  })
})
