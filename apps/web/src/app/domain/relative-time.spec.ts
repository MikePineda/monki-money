import { relativeTime } from './relative-time'

const NOW = new Date('2026-10-16T12:00:00.000Z')

function ago(milliseconds: number): string {
  return new Date(NOW.getTime() - milliseconds).toISOString()
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('relativeTime', () => {
  it('test_under_a_minute_reads_as_now', () => {
    expect(relativeTime(ago(20_000), NOW, 'en-AU')).toBe('now')
  })

  it('test_minutes_and_hours_in_english', () => {
    expect(relativeTime(ago(5 * MINUTE), NOW, 'en-AU')).toBe('5 minutes ago')
    expect(relativeTime(ago(2 * HOUR), NOW, 'en-AU')).toBe('2 hours ago')
  })

  it('test_one_day_back_reads_as_yesterday', () => {
    expect(relativeTime(ago(DAY + HOUR), NOW, 'en-AU')).toBe('yesterday')
  })

  it('test_weeks_months_and_years', () => {
    expect(relativeTime(ago(10 * DAY), NOW, 'en-AU')).toBe('10 days ago')
    expect(relativeTime(ago(70 * DAY), NOW, 'en-AU')).toBe('2 months ago')
    expect(relativeTime(ago(400 * DAY), NOW, 'en-AU')).toBe('last year')
  })

  it('test_spanish_wording', () => {
    expect(relativeTime(ago(2 * HOUR), NOW, 'es-MX')).toBe('hace 2 horas')
    expect(relativeTime(ago(DAY + HOUR), NOW, 'es-MX')).toBe('ayer')
  })

  it('test_a_clock_slightly_behind_the_server_still_reads_as_now', () => {
    expect(relativeTime(ago(-30_000), NOW, 'en-AU')).toBe('now')
  })
})
