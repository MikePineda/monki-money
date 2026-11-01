import { toggleWeekday, weekdayNames } from './reminder-weekdays'

describe('reminder weekdays', () => {
  it('test_the_weekdays_are_named_monday_first_in_the_readers_language', () => {
    expect(weekdayNames('en-AU', 'short')).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ])
    expect(weekdayNames('en-AU', 'long')[6]).toBe('Sunday')
    expect(weekdayNames('es-MX', 'long')).toEqual([
      'lunes',
      'martes',
      'miércoles',
      'jueves',
      'viernes',
      'sábado',
      'domingo',
    ])
  })

  it('test_toggling_a_weekday_keeps_the_days_monday_first_and_never_none', () => {
    expect(toggleWeekday([1, 2, 3, 4, 5, 6, 7], 6)).toEqual([1, 2, 3, 4, 5, 7])
    expect(toggleWeekday([7, 1], 3)).toEqual([1, 3, 7])
    // The last chosen day stays: no day at all would be "off", which is the switch's job.
    expect(toggleWeekday([3], 3)).toEqual([3])
  })
})
