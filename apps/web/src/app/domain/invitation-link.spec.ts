import { invitationToken } from './invitation-link'

const TOKEN = 'q3J9xV_2b-Lm8pQ4rS6tU0wY1zA5cE7gH9jK2nP4sT6' // gitleaks:allow

describe('invitation link', () => {
  it('test_reads_the_token_from_the_emailed_link', () => {
    expect(invitationToken(`https://app.example.test/invite/${TOKEN}`)).toBe(TOKEN)
  })

  it('test_ignores_spaces_a_query_or_a_fragment_around_the_link', () => {
    expect(invitationToken(`  https://app.example.test/invite/${TOKEN}?utm=mail#top \n`)).toBe(
      TOKEN
    )
  })

  it('test_accepts_the_bare_code_or_a_path', () => {
    expect(invitationToken(TOKEN)).toBe(TOKEN)
    expect(invitationToken(`/invite/${TOKEN}`)).toBe(TOKEN)
  })

  it('test_rejects_anything_that_is_not_an_invitation', () => {
    expect(invitationToken('')).toBeNull()
    expect(invitationToken('   ')).toBeNull()
    expect(invitationToken('hello there')).toBeNull()
    expect(invitationToken('https://app.example.test/month')).toBeNull()
    expect(invitationToken('short')).toBeNull()
    expect(invitationToken('https://app.example.test/invite/')).toBeNull()
  })
})
