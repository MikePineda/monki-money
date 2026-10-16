import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { LANG_STORAGE_KEY, LangStore } from '../../core/i18n/lang.store'
import { AuthLayoutComponent } from './auth-layout.component'

@Component({ template: '<p>login form</p>' })
class LoginStub {}

describe('AuthLayoutComponent', () => {
  async function open(url = '/login') {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          {
            path: '',
            component: AuthLayoutComponent,
            children: [
              { path: 'login', component: LoginStub },
              { path: 'household/new', data: { languageSwitch: false }, component: LoginStub },
            ],
          },
        ]),
      ],
    })
    const harness = await RouterTestingHarness.create(url)
    return { harness, root: harness.fixture.nativeElement as HTMLElement }
  }

  function option(root: HTMLElement, label: string): HTMLButtonElement | undefined {
    return [
      ...root.querySelectorAll<HTMLButtonElement>('[data-testid="auth.language"] [role="radio"]'),
    ].find((button) => button.textContent?.trim() === label)
  }

  afterEach(() => {
    localStorage.removeItem(LANG_STORAGE_KEY)
    document.documentElement.lang = 'en-AU'
  })

  it('test_frames_signed_out_screens_with_the_product_name_and_no_tab_bar', async () => {
    const { root } = await open()

    expect(root.querySelector('[data-testid="auth.layout"] header')?.textContent).toContain(
      'monkimoney'
    )
    expect(root.querySelector('main')?.textContent).toContain('login form')
    expect(root.querySelector('app-tab-bar')).toBeNull()
    expect(root.querySelector('app-toast-outlet')).not.toBeNull()
  })

  it('test_the_language_switch_shows_the_current_language', async () => {
    const { root } = await open()

    const group = root.querySelector('[data-testid="auth.language"] [role="radiogroup"]')
    expect(group?.getAttribute('aria-label')).toBe('Language')
    expect(option(root, 'English')?.getAttribute('aria-checked')).toBe('true')
    expect(option(root, 'Español')?.getAttribute('aria-checked')).toBe('false')
  })

  it('test_choosing_spanish_switches_the_screens_and_remembers_it', async () => {
    const { harness, root } = await open()

    option(root, 'Español')?.click()
    await harness.fixture.whenStable()

    const store = TestBed.inject(LangStore)
    expect(store.lang()).toBe('es')
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('es')
    expect(document.documentElement.lang).toBe('es-MX')
    expect(
      root
        .querySelector('[data-testid="auth.language"] [role="radiogroup"]')
        ?.getAttribute('aria-label')
    ).toBe('Idioma')
    expect(option(root, 'Español')?.getAttribute('aria-checked')).toBe('true')
  })

  it('test_a_screen_that_asks_for_the_language_itself_hides_the_switch', async () => {
    const { root } = await open('/household/new')

    expect(root.querySelector('main')?.textContent).toContain('login form')
    expect(root.querySelector('[data-testid="auth.language"]')).toBeNull()
  })
})
