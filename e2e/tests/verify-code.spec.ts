import { OnboardingPage } from '../pages/onboarding.page.ts'
import { SignupPage } from '../pages/signup.page.ts'
import { VerifyEmailPage } from '../pages/verify-email.page.ts'
import { PASSWORD, expect, mailedCode, test, uniqueEmail } from '../support/fixtures.ts'

test.describe('journey 2b: confirming the email with the 6-digit code', () => {
  test('a new owner types the emailed code and continues to onboarding', async ({
    page,
    request,
  }) => {
    const account = { fullName: 'Robin Example', email: uniqueEmail('code'), password: PASSWORD }
    const signup = new SignupPage(page)
    const verify = new VerifyEmailPage(page)

    await signup.goto()
    await signup.signUp(account)
    await expect(page).toHaveURL(/\/verify-email$/)

    // The code from the same email, read from the test-only outbox.
    const code = await mailedCode(request, account.email)
    expect(code).toMatch(/^\d{6}$/)

    // A wrong code is explained under the field and changes nothing.
    await verify.enterCode(code === '000000' ? '111111' : '000000')
    await expect(verify.codeField).toContainText('This code is not right')
    await expect(page).toHaveURL(/\/verify-email$/)

    await verify.enterCode(code)

    await expect(page).toHaveURL(/\/onboarding$/)
    await new OnboardingPage(page).expectStep(1)
  })
})
