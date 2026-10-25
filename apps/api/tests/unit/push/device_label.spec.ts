import { test } from '@japa/runner'
import { deviceLabel } from '#domain/push/device_label'

/** Synthetic user agents with the real shape of each browser's. */
const AGENTS = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  // The installed app (Home Screen) has no Safari token.
  iphoneHomeScreen:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadSafari:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  windowsOpera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/114.0.0.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
}

test.group('Device label', () => {
  test('test_the_label_names_the_browser_and_the_platform', ({ assert }) => {
    assert.deepEqual(deviceLabel(AGENTS.iphoneSafari), { browser: 'Safari', platform: 'iPhone' })
    assert.deepEqual(deviceLabel(AGENTS.iphoneChrome), { browser: 'Chrome', platform: 'iPhone' })
    assert.deepEqual(deviceLabel(AGENTS.iphoneHomeScreen), {
      browser: 'Safari',
      platform: 'iPhone',
    })
    assert.deepEqual(deviceLabel(AGENTS.ipadSafari), { browser: 'Safari', platform: 'iPad' })
    assert.deepEqual(deviceLabel(AGENTS.androidChrome), { browser: 'Chrome', platform: 'Android' })
    assert.deepEqual(deviceLabel(AGENTS.androidSamsung), {
      browser: 'Samsung Internet',
      platform: 'Android',
    })
    assert.deepEqual(deviceLabel(AGENTS.androidFirefox), {
      browser: 'Firefox',
      platform: 'Android',
    })
    assert.deepEqual(deviceLabel(AGENTS.macSafari), { browser: 'Safari', platform: 'macOS' })
    assert.deepEqual(deviceLabel(AGENTS.macChrome), { browser: 'Chrome', platform: 'macOS' })
    assert.deepEqual(deviceLabel(AGENTS.windowsEdge), { browser: 'Edge', platform: 'Windows' })
    assert.deepEqual(deviceLabel(AGENTS.windowsOpera), { browser: 'Opera', platform: 'Windows' })
    assert.deepEqual(deviceLabel(AGENTS.linuxFirefox), { browser: 'Firefox', platform: 'Linux' })
    assert.deepEqual(deviceLabel(AGENTS.chromebook), { browser: 'Chrome', platform: 'ChromeOS' })
  })

  test('test_an_unknown_or_missing_user_agent_has_no_label', ({ assert }) => {
    assert.deepEqual(deviceLabel(null), { browser: null, platform: null })
    assert.deepEqual(deviceLabel(''), { browser: null, platform: null })
    assert.deepEqual(deviceLabel('Test browser'), { browser: null, platform: null })
    assert.deepEqual(deviceLabel('curl/8.7.1'), { browser: null, platform: null })
  })
})
