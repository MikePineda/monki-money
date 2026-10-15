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

test.describe('journey 8: inviting the partner', () => {
  test('the owner invites, the partner creates an account from the link and joins', async ({
    page,
    context,
    browser,
    request,
  }) => {
    await signUpOwner(context, { fullName: 'Robin Example' })
    const settings = new SettingsPage(page)
    const partnerEmail = uniqueEmail('partner')

    await settings.goto()
    await settings.invitePartner(partnerEmail)
    await expect(page.locator('app-toast')).toContainText(`Invitation sent to ${partnerEmail}.`)
    await expect(page.getByTestId('settings.invitations')).toContainText(partnerEmail)

    // The partner opens the emailed link on their own device.
    const link = await mailedLink(request, partnerEmail, '/invite/')
    const partnerContext = await newDevice(browser, test.info())
    const partnerPage = await partnerContext.newPage()
    await partnerPage.goto(link)
    const invite = new InvitePage(partnerPage)
    await expect(invite.title).toContainText('Join')
    await invite.createAccountAndJoin('Sam Example', PASSWORD)

    // A member joins an already set-up household: straight to the month.
    await expect(partnerPage).toHaveURL(/\/month$/)
    await expect(partnerPage.getByTestId('app.shell')).toBeVisible()
    await partnerContext.close()

    await page.reload()
    await expect(settings.members).toContainText('Sam Example')
    await expect(settings.members).toContainText('Member')
    await expect(page.getByTestId('settings.invitations')).toHaveCount(0)
  })
})
