import { Component, computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aUser, httpError } from '../../../../testing/session-fixtures'
import type { User } from '../../../core/api/api-types'
import { AuthApi } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { TextFieldHarness } from '../../../shared/ui/text-field/text-field.harness'
import InvitePage from './invite.page'

@Component({ template: '<p>landed</p>' })
class Landing {}

const TOKEN = 'invite-token-0123456789abcdef'

const preview = {
  email: 'alex@example.test',
  role: 'member',
  householdName: 'Sam’s home',
  inviterName: 'Sam Rivera',
  expiresAt: '2026-10-22T00:00:00.000Z',
}

type Signed = 'guest' | 'withHousehold' | 'withoutHousehold'

describe('InvitePage', () => {
  let api: { invitation: ReturnType<typeof vi.fn>; acceptInvitation: ReturnType<typeof vi.fn> }
  let session: Record<string, unknown>

  async function setup(signed: Signed, lookup: () => Promise<unknown> = async () => preview) {
    api = { invitation: vi.fn(lookup), acceptInvitation: vi.fn(async () => undefined) }
    const user = signal<User | null>(
      signed === 'guest' ? null : aUser({ email: 'alex@example.test' })
    )
    const hasHousehold = signal(signed === 'withHousehold')
    session = {
      isAuthenticated: computed(() => user() !== null),
      hasHousehold,
      user,
      homePath: computed(() => (user() ? '/month' : '/login')),
      load: vi.fn(async () => {
        user.set(aUser({ email: 'alex@example.test' }))
        hasHousehold.set(true)
      }),
      logout: vi.fn(async () => undefined),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            { path: 'invite/:token', component: InvitePage },
            { path: '**', component: Landing },
          ],
          withComponentInputBinding()
        ),
        { provide: AuthApi, useValue: api },
        { provide: SessionStore, useValue: session },
      ],
    })
    const harness = await RouterTestingHarness.create(`/invite/${TOKEN}`)
    const root = harness.fixture.nativeElement as HTMLElement
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    return { harness, root, loader }
  }

  afterEach(() => sessionStorage.clear())

  it('test_signed_out_shows_who_invited_whom_and_keeps_the_token_for_login', async () => {
    const { root } = await setup('guest')

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="invite.title"]')?.textContent).toContain(
        'Join Sam’s home'
      )
    )
    expect(root.querySelector('[data-testid="invite.from"]')?.textContent).toContain(
      'Sam Rivera invited alex@example.test'
    )
    expect(sessionStorage.getItem('mm:invite')).toBe(TOKEN)
    expect(root.querySelector('[data-testid="invite.login"]')?.getAttribute('href')).toBe('/login')
  })

  it('test_create_account_accepts_in_place_and_goes_home', async () => {
    const { root, loader, harness } = await setup('guest')
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="invite.create"]')).not.toBeNull()
    )
    root.querySelector<HTMLButtonElement>('[data-testid="invite.create"]')?.click()
    await harness.fixture.whenStable()

    await (await loader.getHarness(TextFieldHarness.with({ label: 'Your name' }))).setValue('Alex')
    await (
      await loader.getHarness(TextFieldHarness.with({ label: 'Password' }))
    ).setValue('alex-password-1')
    root.querySelector<HTMLButtonElement>('[data-testid="invite.accept"]')?.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month'))
    expect(api.acceptInvitation).toHaveBeenCalledWith(TOKEN, {
      fullName: 'Alex',
      password: 'alex-password-1',
    })
    expect(sessionStorage.getItem('mm:invite')).toBeNull()
  })

  it('test_signed_in_with_a_household_explains_the_one_household_rule', async () => {
    const { root } = await setup('withHousehold')

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="invite.alreadyIn"]')).not.toBeNull()
    )
    expect(sessionStorage.getItem('mm:invite')).toBeNull()
  })

  it('test_signed_in_without_a_household_joins_with_the_password', async () => {
    const { root, loader } = await setup('withoutHousehold')
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="invite.accept"]')).not.toBeNull()
    )

    await (
      await loader.getHarness(TextFieldHarness.with({ label: 'Password' }))
    ).setValue('alex-password-1')
    root.querySelector<HTMLButtonElement>('[data-testid="invite.accept"]')?.click()

    await vi.waitFor(() =>
      expect(api.acceptInvitation).toHaveBeenCalledWith(TOKEN, { password: 'alex-password-1' })
    )
  })

  it('test_an_invitation_for_another_address_can_be_set_aside', async () => {
    const { root } = await setup('withoutHousehold', async () => ({
      ...preview,
      email: 'robin@example.test',
    }))
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="invite.otherEmail"]')).not.toBeNull()
    )
    expect(sessionStorage.getItem('mm:invite')).toBe(TOKEN)

    root.querySelector<HTMLButtonElement>('[data-testid="invite.notNow"]')?.click()

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/month'))
    expect(sessionStorage.getItem('mm:invite')).toBeNull()
    expect(session['logout']).not.toHaveBeenCalled()
  })

  it('test_an_unknown_link_says_so', async () => {
    const { root } = await setup('guest', () => Promise.reject(httpError(404)))

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="invite.invalid"]')).not.toBeNull()
    )
    expect(sessionStorage.getItem('mm:invite')).toBeNull()
  })

  it('test_an_expired_link_says_so', async () => {
    const { root } = await setup('guest', () =>
      Promise.reject(httpError(410, { code: 'E_INVITATION_EXPIRED' }))
    )

    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="invite.expired"]')).not.toBeNull()
    )
  })
})
