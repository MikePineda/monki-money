import { DateTime } from 'luxon'
import env from '#start/env'
import User from '#models/user'
import { test } from '@japa/runner'
import Invitation from '#models/invitation'
import mail from '@adonisjs/mail/services/main'
import type InvitationMail from '#mails/invitation_mail'
import HouseholdMember from '#models/household_member'
import limiter from '@adonisjs/limiter/services/main'
import { createHousehold } from '#tests/helpers/household'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { generateInvitationToken, hashInvitationToken } from '#domain/households/invitation_token'
import type { ApiClient } from '@japa/api-client'

/** An invitation row with a known token (as if it had been emailed). */
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

/** Invites through the API and returns the token found in the captured email. */
async function inviteThroughApi(client: ApiClient, owner: User, email: string) {
  const { mails } = mail.fake()
  const response = await client
    .post('/api/v1/household/invitations')
    .json({ email })
    .actingAs(owner)
  response.assertStatus(201)
  const sent = mails.sent().at(-1) as InvitationMail
  mail.restore()
  return { response, url: sent.url, token: sent.url.split('/invite/')[1] }
}

test.group('Household invitations', (group) => {
  group.each.setup(() => {
    const original = env.get('REGISTRATION_OPEN')
    return () => env.set('REGISTRATION_OPEN', original)
  })
  group.each.setup(() => limiter.clear())

  test('test_owner_invites_by_email_and_the_link_goes_only_by_mail', async ({ client, assert }) => {
    const { owner, household } = await createHousehold()

    const { response, url, token } = await inviteThroughApi(client, owner, 'Partner@Example.test')

    response.assertBodyContains({ data: { email: 'partner@example.test', role: 'member' } })
    assert.isTrue(url.startsWith('http://127.0.0.1:3333/invite/'))
    const stored = await Invitation.findByOrFail('household_id', household.id)
    assert.equal(stored.tokenHash, hashInvitationToken(token))
  })

  test('test_owner_cannot_read_invite_token_from_api', async ({ client, assert }) => {
    const { owner } = await createHousehold()

    const { response, token } = await inviteThroughApi(client, owner, 'partner@example.test')
    const list = await client.get('/api/v1/household/invitations').actingAs(owner)

    for (const body of [response.body(), list.body()]) {
      const json = JSON.stringify(body)
      assert.notInclude(json, token)
      assert.notInclude(json, hashInvitationToken(token))
      assert.notInclude(json, '/invite/')
    }
    assert.notProperty(response.body().data, 'url')
  })

  test('test_owner_resends_an_invitation_with_a_fresh_link', async ({ client }) => {
    const { owner } = await createHousehold()
    const first = await inviteThroughApi(client, owner, 'partner@example.test')

    const { mails } = mail.fake()
    const resend = await client
      .post(`/api/v1/household/invitations/${first.response.body().data.id}/resend`)
      .actingAs(owner)
    resend.assertStatus(200)
    const fresh = (mails.sent().at(-1) as InvitationMail).url.split('/invite/')[1]
    mail.restore()

    const oldLink = await client.get(`/api/v1/auth/invitations/${first.token}`)
    oldLink.assertStatus(404)
    const newLink = await client.get(`/api/v1/auth/invitations/${fresh}`)
    newLink.assertStatus(200)
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

  test('test_invite_is_refused_when_the_plan_member_limit_is_reached', async ({ client }) => {
    // Free plan: 2 members.
    const { owner } = await createHousehold({ users: 2 })

    const response = await client
      .post('/api/v1/household/invitations')
      .json({ email: 'third@example.test' })
      .actingAs(owner)

    response.assertStatus(402)
    response.assertBodyContains({ code: 'E_MEMBER_LIMIT_REACHED' })
  })

  test('test_invitations_are_rate_limited_per_household', async ({ client }) => {
    mail.fake()
    const { owner } = await createHousehold()
    const invite = (n: number) =>
      client
        .post('/api/v1/household/invitations')
        .json({ email: `friend${n}@example.test` })
        .actingAs(owner)

    for (let n = 1; n <= 10; n++) {
      const response = await invite(n)
      response.assertStatus(201)
    }
    const blocked = await invite(11)
    blocked.assertStatus(429)
    mail.restore()
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
    assert.properties(list.body().data[0], ['email', 'expiresAt'])
    assert.notProperty(list.body().data[0], 'tokenHash')

    const revoke = await client
      .delete(`/api/v1/household/invitations/${invitation.id}`)
      .actingAs(owner)
    revoke.assertStatus(204)
    assert.isNull(await Invitation.find(invitation.id))
  })

  test('test_member_cannot_revoke_or_resend_an_invitation', async ({ client, assert }) => {
    const { member, household } = await createHousehold({ users: 2 })
    const { invitation } = await invitationFor(household.id, 'partner@example.test')

    const revoke = await client
      .delete(`/api/v1/household/invitations/${invitation.id}`)
      .actingAs(member)
    revoke.assertStatus(403)

    const resend = await client
      .post(`/api/v1/household/invitations/${invitation.id}/resend`)
      .actingAs(member)
    resend.assertStatus(403)
    assert.isNotNull(await Invitation.find(invitation.id))
  })

  test('test_invitation_show_describes_the_household_without_revealing_accounts', async ({
    client,
    assert,
  }) => {
    const { owner, household } = await createHousehold({ name: 'Shared home' })
    const existing = await UserFactory.create()
    const { token } = await invitationFor(household.id, existing.email, {
      invitedByUserId: owner.id,
    })

    const response = await client.get(`/api/v1/auth/invitations/${token}`)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        email: existing.email,
        householdName: 'Shared home',
        inviterName: owner.fullName,
        role: 'member',
      },
    })
    assert.notProperty(response.body().data, 'userExists')
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
    const { owner, household } = await createHousehold()
    const { token } = await inviteThroughApi(client, owner, 'partner@example.test')
    // Invitations work even with public sign-up closed.
    env.set('REGISTRATION_OPEN', false)

    const response = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({ fullName: 'Pat Partner', password: 'a-long-enough-password' })
      .withCsrfToken()

    response.assertStatus(200)
    response.assertBodyContains({
      data: { user: { email: 'partner@example.test' }, household: { id: household.id } },
    })

    // Verified because the token reached that inbox.
    const user = await User.findByOrFail('email', 'partner@example.test')
    assert.isNotNull(user.emailVerifiedAt)
    assert.equal(user.currentHouseholdId, household.id)
    const membership = await HouseholdMember.query()
      .where('household_id', household.id)
      .where('user_id', user.id)
      .firstOrFail()
    assert.equal(membership.role, 'member')
    response.assertSession('auth_web', user.id)

    const invitation = await Invitation.findByOrFail('household_id', household.id)
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

    const missing = await client
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .json({})
      .withCsrfToken()
    missing.assertStatus(422)
    missing.assertBodyContains({ errors: [{ field: 'password', rule: 'required' }] })

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

  test('test_accept_is_refused_when_the_household_became_full', async ({ client }) => {
    const { household } = await createHousehold()
    const first = await invitationFor(household.id, 'one@example.test')
    const second = await invitationFor(household.id, 'two@example.test')

    const accepted = await client
      .post(`/api/v1/auth/invitations/${first.token}/accept`)
      .json({ fullName: 'One', password: 'a-long-enough-password' })
      .withCsrfToken()
    accepted.assertStatus(200)

    const refused = await client
      .post(`/api/v1/auth/invitations/${second.token}/accept`)
      .json({ fullName: 'Two', password: 'a-long-enough-password' })
      .withCsrfToken()
    refused.assertStatus(402)
    refused.assertBodyContains({ code: 'E_MEMBER_LIMIT_REACHED' })
  })

  test('test_accept_is_refused_for_a_household_that_is_{$self}')
    .with(['pending_deletion', 'suspended'] as const)
    .run(async ({ client, assert }, status) => {
      const { household } = await createHousehold()
      const { token } = await invitationFor(household.id, 'partner@example.test')
      household.status = status
      household.deletionScheduledAt =
        status === 'pending_deletion' ? DateTime.now().plus({ days: 5 }) : null
      await household.save()

      const show = await client.get(`/api/v1/auth/invitations/${token}`)
      show.assertStatus(410)

      const accept = await client
        .post(`/api/v1/auth/invitations/${token}/accept`)
        .json({ fullName: 'Pat Partner', password: 'a-long-enough-password' })
        .withCsrfToken()
      accept.assertStatus(410)
      assert.isNull(await User.findBy('email', 'partner@example.test'))
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
