import { OnboardingPage } from '../pages/onboarding.page.ts'
import { SignupPage } from '../pages/signup.page.ts'
import { PASSWORD, expect, mailedLink, test, uniqueEmail } from '../support/fixtures.ts'

test.describe('journey 2: sign-up, verification and onboarding', () => {
  test('a new owner signs up, confirms the email and sets the household up', async ({
    page,
    request,
  }) => {
    const account = { fullName: 'Robin Example', email: uniqueEmail('signup'), password: PASSWORD }
    const signup = new SignupPage(page)
    const onboarding = new OnboardingPage(page)

    await signup.goto()
    await signup.signUp(account)
    await expect(page).toHaveURL(/\/verify-email$/)
    await expect(page.getByTestId('verify.pending')).toBeVisible()
    await expect(page.getByText(account.email)).toBeVisible()

    // The emailed link, read from the test-only outbox.
    await page.goto(await mailedLink(request, account.email, '/verify-email?token='))
    await expect(page.getByTestId('verify.confirmed')).toBeVisible()
    await page.getByTestId('verify.continue').click()

    await expect(page).toHaveURL(/\/onboarding$/)
    await onboarding.nameHousehold('Robin and Sam')
    await onboarding.keepRegion()
    await onboarding.chooseAccounts('nab-everyday', 'hnry')

    // Resumable: a reload keeps the wizard on the step it was on.
    await page.reload()
    await onboarding.inviteLater()

    await expect(page).toHaveURL(/\/month$/)
    await expect(page.getByTestId('app.shell')).toBeVisible()

    // Set up: the app opens on the month from now on.
    await page.goto('/')
    await expect(page).toHaveURL(/\/month$/)

    // On record for the household, so any other device opens the app too.
    const me = await page.request.get('/api/v1/auth/me')
    expect(me.ok()).toBe(true)
    const { data } = (await me.json()) as { data: { household: { onboardedAt: string | null } } }
    expect(data.household.onboardedAt).not.toBeNull()
  })
})
