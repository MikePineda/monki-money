import {
  ACCOUNT_PRESETS,
  matchesPreset,
  ownerChoiceOf,
  ownerUserIdFor,
  type AccountPreset,
} from './account-presets'

const cash = ACCOUNT_PRESETS.find((preset) => preset.id === 'cash') as AccountPreset
const everyday = ACCOUNT_PRESETS.find((preset) => preset.id === 'nab-everyday') as AccountPreset

describe('account presets', () => {
  it('test_presets_come_from_the_json_file_with_known_kinds', () => {
    expect(ACCOUNT_PRESETS.map((preset) => preset.id)).toEqual([
      'nab-everyday',
      'nab-savings',
      'hnry',
      'cash',
    ])
    for (const preset of ACCOUNT_PRESETS) {
      expect(['transaction', 'savings', 'wallet', 'cash', 'other']).toContain(preset.kind)
      expect(['you', 'joint']).toContain(preset.owner)
    }
  })

  it('test_an_account_matches_a_branded_preset_by_name_ignoring_case', () => {
    expect(matchesPreset({ name: 'NAB Everyday', kind: 'transaction' }, everyday)).toBe(true)
    expect(matchesPreset({ name: 'nab everyday ', kind: 'transaction' }, everyday)).toBe(true)
    expect(matchesPreset({ name: 'NAB Savings', kind: 'savings' }, everyday)).toBe(false)
  })

  it('test_cash_matches_by_kind_whatever_language_named_it', () => {
    expect(matchesPreset({ name: 'Efectivo', kind: 'cash' }, cash)).toBe(true)
    expect(matchesPreset({ name: 'Cash', kind: 'cash' }, cash)).toBe(true)
    expect(matchesPreset({ name: 'Cash jar', kind: 'other' }, cash)).toBe(false)
  })

  it('test_owner_choice_reads_the_owner_user_id', () => {
    expect(ownerChoiceOf(null, 1)).toBe('joint')
    expect(ownerChoiceOf(1, 1)).toBe('you')
    expect(ownerChoiceOf(2, 1)).toBe('partner')
  })

  it('test_owner_user_id_for_each_choice', () => {
    expect(ownerUserIdFor('joint', 1, 2)).toBeNull()
    expect(ownerUserIdFor('you', 1, 2)).toBe(1)
    expect(ownerUserIdFor('partner', 1, 2)).toBe(2)
    // No partner yet: the account stays joint until they join.
    expect(ownerUserIdFor('partner', 1, null)).toBeNull()
  })
})
