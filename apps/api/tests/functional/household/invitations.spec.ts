import { DateTime } from 'luxon'
import env from '#start/env'
import User from '#models/user'
import { test } from '@japa/runner'
import Invitation from '#models/invitation'
import mail from '@adonisjs/mail/services/main'
import InvitationMail from '#mails/invitation_mail'
import HouseholdMember from '#models/household_member'
import limiter from '@adonisjs/limiter/services/main'
import { createHousehold } from '#tests/helpers/household'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { generateInvitationToken, hashInvitationToken } from '#domain/households/invitation_token'

async function invitationFor(
  householdId: number,
  email: string,
  overrides: Partial<Invitation> = {}
) {
  const token = generateInvitationToken()
  const invitation = await Invitation.create({
    householdId,
    email,
    tokenHash: hashInvitationToken(token),
    role: 'member',
    expiresAt: DateTime.now().plus({ days: 7 }),
    acceptedAt: null,
    ...overrides,
  })
  return { token, invitation }
}

test.group('Household invitations', (group) => {
  group.each.setup(() => {
    const original = env.get('REGISTRATION_OPEN')
    return () => env.set('REGISTRATION_OPEN', original)
  })
  group.each.setup(() => limiter.clear())

  test('test_owner_invites_by_email_and_gets_a_shareable_link', async ({ client, assert }) => {
    const { mails } = mail.fake()
    const { owner, household } = await createHousehold()

    const response = await client
      .post('/api/v1/household/invitations')
      .json({ email: 'Partner@Example.test' })
      .actingAs(owner)

    response.assertStatus(201)
    response.assertBodyContains({ data: { email: 'partner@example.test', role: 'member' } })
    const url: string = response.body().data.url
    assert.isTrue(url.startsWith('http://127.0.0.1:3333/invite/'))

    const token = url.split('/invite/')[1]
    const stored = await Invitation.findByOrFail('household_id', household.id)
    assert.equal(stored.tokenHash, hashInvitationToken(token))
    assert.notEqual(stored.tokenHash, token)

    mails.assertSent(
      InvitationMail,
      (sent) => sent.email === 'partner@example.test' && sent.url === url
    )
    mail.restore()
  })

  test('test_inviting_an_existing_member_is_rejected', async ({ client }) => {
    const { owner, member } = await createHousehold({ users: 2 })

    const response = await client
      .post('/api/v1/household/invitations')
      .json({ email: member.email })
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'email', rule: 'alreadyMember' }] })
  })

  test('test_owner_lists_and_revokes_pending_invitations', async ({ client, assert }) => {
    const { owner, household } = await createHousehold()
    const { invitation } = await invitationFor(household.id, 'partner@example.test')

    const list = await client.get('/api/v1/household/invitations').actingAs(owner)
    list.assertStatus(200)
    assert.deepEqual(
      list.body().data.map((row: any) => row.id),
      [invitation.id]
    )
    assert.notProperty(list.body().data[0], 'tokenHash')

    const revoke = await client
      .delete(`/api/v1/household/invitations/${invitation.id}`)
      .actingAs(owner)
    revoke.assertStatus(204)
    assert.isNull(await Invitation.find(invitation.id))
  })

  test('test_invitation_show_describes_the_household', async ({ client }) => {
    const { owner, household } = await createHousehold({ name: 'Shared home' })
    const { token } = await invitationFor(household.id, 'partner@example.test', {
      invitedByUserId: owner.id,
    })

    const response = await client.get(`/api/v1/auth/invitations/${token}`)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        email: 'partner@example.test',
        householdName: 'Shared home',
        inviterName: owner.fullName,
        role: 'member',
        userExists: false,
      },
    })
  })

  test('test_unknown_invitation_returns_404', async ({ client }) => {
    const response = await client.get(`/api/v1/auth/invitations/${generateInvitationToken()}`)

    response.assertStatus(404)
  })

  test('test_expired_invitation_returns_410', async ({ client }) => {
    const { household } = await createHousehold()
    const { token } = await invitationFor(household.id, 'partner@example.test', {
      expiresAt: DateTime.now().minus({ minutes: 1 }),
    })

    const show = await client.get(`/api/v1/auth/invitations/${token}`)
    show.assertStatus(410)
    show.assertBodyContains({ code: 'E_INVITATION_EXPIRED' })

    const accept = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({ fullName: 'Pat Partner', password: 'a-long-enough-password' })
      .withCsrfToken()
    accept.assertStatus(410)
  })

  test('test_invitation_accept_creates_membership_and_logs_in', async ({ client, assert }) => {
    // Invitations work even with public sign-up closed.
    env.set('REGISTRATION_OPEN', false)
    const { household } = await createHousehold()
    const { token, invitation } = await invitationFor(household.id, 'partner@example.test')

    const response = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({ fullName: 'Pat Partner', password: 'a-long-enough-password' })
      .withCsrfToken()

    response.assertStatus(200)
    response.assertBodyContains({
      data: { user: { email: 'partner@example.test' }, household: { id: household.id } },
    })

    const user = await User.findByOrFail('email', 'partner@example.test')
    assert.isNotNull(user.emailVerifiedAt)
    assert.equal(user.currentHouseholdId, household.id)
    const membership = await HouseholdMember.query()
      .where('household_id', household.id)
      .where('user_id', user.id)
      .firstOrFail()
    assert.equal(membership.role, 'member')
    response.assertSession('auth_web', user.id)

    await invitation.refresh()
    assert.isNotNull(invitation.acceptedAt)

    const again = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({ fullName: 'Pat Partner', password: 'a-long-enough-password' })
      .withCsrfToken()
    again.assertStatus(410)
  })

  test('test_invitation_accept_for_an_existing_user_requires_their_password', async ({
    client,
  }) => {
    const { household } = await createHousehold()
    const existing = await UserFactory.create()
    const { token } = await invitationFor(household.id, existing.email)

    const wrong = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({ password: 'not-the-password' })
      .withCsrfToken()
    wrong.assertStatus(422)
    wrong.assertBodyContains({ errors: [{ field: 'password', rule: 'matches' }] })

    const right = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({ password: FACTORY_PASSWORD })
      .withCsrfToken()
    right.assertStatus(200)
  })

  test('test_a_user_who_already_has_a_household_cannot_join_another', async ({ client }) => {
    const first = await createHousehold()
    const second = await createHousehold()
    const { token } = await invitationFor(second.household.id, first.owner.email)

    const response = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({ password: FACTORY_PASSWORD })
      .withCsrfToken()

    response.assertStatus(409)
    response.assertBodyContains({ code: 'E_ALREADY_IN_HOUSEHOLD' })
  })

  test('test_new_invitee_needs_a_name_and_a_strong_password', async ({ client }) => {
    const { household } = await createHousehold()
    const { token } = await invitationFor(household.id, 'partner@example.test')

    const response = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({ password: 'short' })
      .withCsrfToken()

    response.assertStatus(422)
  })
})
