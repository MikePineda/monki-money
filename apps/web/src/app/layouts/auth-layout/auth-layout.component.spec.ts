import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { AuthLayoutComponent } from './auth-layout.component'

@Component({ template: '<p>login form</p>' })
class LoginStub {}

describe('AuthLayoutComponent', () => {
  it('test_frames_signed_out_screens_with_the_product_name_and_no_tab_bar', async () => {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([
          {
            path: '',
            component: AuthLayoutComponent,
            children: [{ path: 'login', component: LoginStub }],
          },
        ]),
      ],
    })
    const harness = await RouterTestingHarness.create('/login')
    const root = harness.fixture.nativeElement as HTMLElement

    expect(root.querySelector('[data-testid="auth.layout"] header')?.textContent).toContain(
      'monkimoney'
    )
    expect(root.querySelector('main')?.textContent).toContain('login form')
    expect(root.querySelector('app-tab-bar')).toBeNull()
    expect(root.querySelector('app-toast-outlet')).not.toBeNull()
  })
})
