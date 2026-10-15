import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import AddPage from './add.page'

describe('AddPage', () => {
  async function render(type?: string) {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders(), provideRouter([])],
    })
    const fixture = TestBed.createComponent(AddPage)
    if (type !== undefined) {
      fixture.componentRef.setInput('type', type)
    }
    await fixture.whenStable()
    const root = fixture.nativeElement as HTMLElement
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="add.title"]')?.textContent?.trim()).not.toBe('')
    )
    return root
  }

  it('test_defaults_to_an_expense', async () => {
    const root = await render()

    expect(root.querySelector('[data-testid="add.title"]')?.textContent?.trim()).toBe('Add expense')
  })

  it('test_the_manifest_shortcut_type_picks_the_title', async () => {
    expect((await render('income')).querySelector('h1')?.textContent?.trim()).toBe('Add income')
  })

  it('test_an_unknown_type_falls_back_to_expense', async () => {
    expect((await render('gift')).querySelector('h1')?.textContent?.trim()).toBe('Add expense')
  })

  it('test_done_returns_to_the_month', async () => {
    const root = await render()

    expect(root.querySelector('a[href="/month"]')?.textContent?.trim()).toBe('Done')
  })
})
