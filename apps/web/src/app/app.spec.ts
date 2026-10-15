import { TestBed } from '@angular/core/testing'
import { App } from './app'

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents()
  })

  it('renders the shell with the product name', async () => {
    const fixture = TestBed.createComponent(App)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement

    expect(element.querySelector('[data-testid="app.shell"]')).not.toBeNull()
    expect(element.querySelector('h1')?.textContent).toContain('monkimoney')
  })
})
