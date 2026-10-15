import { CreateHouseholdPage } from '../pages/create-household.page.ts'
import { InvitePage } from '../pages/invite.page.ts'
import { OnboardingPage } from '../pages/onboarding.page.ts'
import { SettingsPage } from '../pages/settings.page.ts'
import {
  PASSWORD,
  expect,
  mailedLink,
  newDevice,
  signUpOwner,
  test,
  uniqueEmail,
} from '../support/fixtures.ts'

test.describe('journey 9: leaving the household and starting another', () => {
  test('a member leaves, creates their own household and starts on an empty month', async ({
    page,
    context,
    browser,
    request,
  }) => {
    await signUpOwner(context, { fullName: 'Robin Example' })
    const settings = new SettingsPage(page)
    const memberEmail = uniqueEmail('member')

    // The owner invites; the member joins through the emailed link.
    await settings.goto()
    await settings.invitePartner(memberEmail)
    await expect(page.getByTestId('settings.invitations')).toContainText(memberEmail)
    const link = await mailedLink(request, memberEmail, '/invite/')
    const memberContext = await newDevice(browser, test.info())
    const memberPage = await memberContext.newPage()
    await memberPage.goto(link)
    await new InvitePage(memberPage).createAccountAndJoin('Sam Example', PASSWORD)
    await expect(memberPage).toHaveURL(/\/month$/)

    // Owners never see "Leave"; members do.
    await expect(settings.leave).toHaveCount(0)
    const memberSettings = new SettingsPage(memberPage)
    await memberSettings.goto()
    await expect(memberPage.getByTestId('settings.delete')).toHaveCount(0)
    await memberSettings.leaveHousehold()

    await expect(memberPage).toHaveURL(/\/household\/new$/)
    await new CreateHouseholdPage(memberPage).create('Sam’s place')

    // Name and region are set: the wizard continues with the accounts.
    const onboarding = new OnboardingPage(memberPage)
    await expect(memberPage).toHaveURL(/\/onboarding$/)
    await onboarding.chooseAccounts('nab-everyday')
    await onboarding.inviteLater()
    await expect(memberPage).toHaveURL(/\/month$/)
    await expect(memberPage.getByTestId('month.empty')).toBeVisible()
    await memberContext.close()

    // The owner's household carries on without them.
    await page.reload()
    await expect(settings.members).toContainText('Robin Example')
    await expect(settings.members).not.toContainText('Sam Example')
  })
})
