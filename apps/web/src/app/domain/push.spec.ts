import { base64UrlToBytes, isAppPath, notificationUrl, sameServerKey } from './push'

/** A 65-byte P-256 public key in URL-safe base64, as `GET /config` serves it. */
const KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'

describe('push', () => {
  it('test_a_url_safe_base64_key_decodes_to_its_bytes', () => {
    const bytes = base64UrlToBytes(KEY)

    expect(bytes).toHaveLength(65)
    expect(bytes[0]).toBe(0x04)
    expect(Array.from(base64UrlToBytes('-_8'))).toEqual([0xfb, 0xff])
  })

  it('test_a_subscription_made_with_the_served_key_matches_it', () => {
    const buffer = base64UrlToBytes(KEY).buffer as ArrayBuffer

    expect(sameServerKey(buffer, KEY)).toBe(true)
  })

  it('test_a_subscription_made_with_another_key_or_none_does_not_match', () => {
    const other = base64UrlToBytes(KEY)
    other[64] ^= 1

    expect(sameServerKey(other.buffer as ArrayBuffer, KEY)).toBe(false)
    expect(sameServerKey(null, KEY)).toBe(false)
    expect(sameServerKey(new ArrayBuffer(0), KEY)).toBe(false)
  })

  it('test_only_paths_of_the_app_are_followed', () => {
    expect(isAppPath('/month/2026-09')).toBe(true)
    expect(isAppPath('/add')).toBe(true)
    expect(isAppPath('//evil.example/add')).toBe(false)
    expect(isAppPath('/\\evil.example')).toBe(false)
    expect(isAppPath('https://evil.example/add')).toBe(false)
    expect(isAppPath('add')).toBe(false)
  })

  it('test_the_url_of_a_tapped_notification_comes_from_its_data', () => {
    expect(notificationUrl({ data: { url: '/month/2026-09' } })).toBe('/month/2026-09')
    expect(notificationUrl({ data: { url: 'https://evil.example' } })).toBeNull()
    expect(notificationUrl({ data: { url: 42 } })).toBeNull()
    expect(notificationUrl({ data: null })).toBeNull()
    expect(notificationUrl({})).toBeNull()
  })
})
