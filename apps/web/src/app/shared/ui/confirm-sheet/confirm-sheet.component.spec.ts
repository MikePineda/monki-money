import { TestBed } from '@angular/core/testing'
import { firstValueFrom } from 'rxjs'
import { BottomSheetService } from '../bottom-sheet/bottom-sheet.service'
import { openConfirmSheet } from './confirm-sheet.component'

describe('ConfirmSheetComponent', () => {
  async function ask(destructive = false) {
    const sheets = TestBed.inject(BottomSheetService)
    const answer = firstValueFrom(
      openConfirmSheet(sheets, {
        title: 'Cancel this import?',
        body: 'The rows waiting for review are dropped.',
        confirmLabel: 'Cancel import',
        cancelLabel: 'Keep reviewing',
        destructive,
      })
    )
    await new Promise((resolve) => setTimeout(resolve))
    const button = (id: string) =>
      document.querySelector<HTMLButtonElement>(
        `[data-testid="confirm.${id}"]`
      ) as HTMLButtonElement
    return { answer, button, sheets }
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_states_the_question_and_resolves_true_on_confirm', async () => {
    const { answer, button } = await ask()

    expect(document.querySelector('.mm-sheet-panel h2')?.textContent?.trim()).toBe(
      'Cancel this import?'
    )
    expect(document.querySelector('[data-testid="confirm.body"]')?.textContent).toContain('dropped')
    button('yes').click()

    await expect(answer).resolves.toBe(true)
  })

  it('test_declining_or_dismissing_resolves_false', async () => {
    const first = await ask()
    first.button('no').click()
    await expect(first.answer).resolves.toBe(false)

    const second = await ask()
    second.sheets.closeAll()
    await expect(second.answer).resolves.toBe(false)
  })

  it('test_a_destructive_confirm_uses_the_destructive_button', async () => {
    const { button } = await ask(true)

    expect(button('yes').getAttribute('data-variant')).toBe('destructive')
  })
})
