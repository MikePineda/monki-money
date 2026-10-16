import { InvitePage } from '../pages/invite.page.ts'
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

test.describe('journey 10: handing the household over', () => {
  test('the owner makes the partner the owner and then leaves as a member', async ({
    page,
    context,
    browser,
    request,
  }) => {
    await signUpOwner(context, { fullName: 'Robin Example' })
    const settings = new SettingsPage(page)
    const memberEmail = uniqueEmail('member')

    // The owner invites; the partner joins through the emailed link.
    await settings.goto()
    await settings.invitePartner(memberEmail)
    await expect(page.getByTestId('settings.invitations')).toContainText(memberEmail)
    const link = await mailedLink(request, memberEmail, '/invite/')
    const memberContext = await newDevice(browser, test.info())
    const memberPage = await memberContext.newPage()
    await memberPage.goto(link)
    await new InvitePage(memberPage).createAccountAndJoin('Sam Example', PASSWORD)
    await expect(memberPage).toHaveURL(/\/month$/)

    // Members never see "Make owner".
    const memberSettings = new SettingsPage(memberPage)
    await memberSettings.goto()
    await expect(memberSettings.makeOwner).toHaveCount(0)

    // A wrong password keeps the owner the owner.
    await settings.goto()
    await expect(settings.members).toContainText('Sam Example')
    await settings.makePartnerOwner('not-my-password')
    await expect(page.getByTestId('ownership.password')).toContainText('The password is incorrect')
    await page.getByTestId('ownership.password').locator('input').fill(PASSWORD)
    await page.getByTestId('ownership.confirm').click()

    // The former owner is a member now: no owner controls, "Leave" instead.
    await expect(page.getByTestId('settings.delete')).toHaveCount(0)
    await expect(settings.makeOwner).toHaveCount(0)
    await expect(settings.members.getByRole('listitem').nth(1)).toContainText('Owner')
    await settings.leaveHousehold()
    await expect(page).toHaveURL(/\/household\/new$/)

    // The partner runs the household on their own.
    await memberSettings.goto()
    await expect(memberSettings.members).not.toContainText('Robin Example')
    await expect(memberSettings.members).toContainText('Owner')
    await expect(memberPage.getByTestId('settings.delete')).toBeVisible()
    await expect(memberSettings.leave).toHaveCount(0)
    await memberContext.close()
  })
})
