import { DEFAULT_TIME_ZONE, deviceTimeZone, supportedTimeZones } from './time-zones'

describe('time zones', () => {
  afterEach(() => vi.restoreAllMocks())

  it('test_lists_the_iana_zones_the_runtime_knows', () => {
    expect(supportedTimeZones()).toContain('Australia/Brisbane')
  })

  it('test_an_old_runtime_without_the_list_gets_an_empty_one', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new RangeError('unsupported')
    })

    expect(supportedTimeZones()).toEqual([])
  })

  it('test_the_device_zone_is_used_when_it_is_a_known_one', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'Australia/Perth',
    } as Intl.ResolvedDateTimeFormatOptions)

    expect(deviceTimeZone()).toBe('Australia/Perth')
  })

  it('test_an_unknown_device_zone_falls_back', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      timeZone: 'Mars/Olympus_Mons',
    } as Intl.ResolvedDateTimeFormatOptions)

    expect(deviceTimeZone()).toBe(DEFAULT_TIME_ZONE)
    expect(deviceTimeZone('Australia/Sydney')).toBe('Australia/Sydney')
  })
})
