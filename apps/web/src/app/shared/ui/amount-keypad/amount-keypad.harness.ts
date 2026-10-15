import { ComponentHarness } from '@angular/cdk/testing'
import type { KeypadKey } from '../../../domain/money'

type PressableKey = Exclude<KeypadKey, 'clear'>

export class AmountKeypadHarness extends ComponentHarness {
  static hostSelector = 'app-amount-keypad'

  private readonly group = this.locatorFor('[role="group"]')
  private readonly live = this.locatorFor('[aria-live]')

  async press(...keys: PressableKey[]): Promise<void> {
    for (const key of keys) {
      await (await this.locatorFor(`button[data-key="${key}"]`)()).click()
    }
  }

  async getKeyLabels(): Promise<string[]> {
    const buttons = await this.locatorForAll('button')()
    return Promise.all(
      buttons.map(async (button) => (await button.getAttribute('aria-label')) ?? button.text())
    )
  }

  async getGroupLabel(): Promise<string | null> {
    return (await this.group()).getAttribute('aria-label')
  }

  async getAnnouncement(): Promise<string> {
    return (await this.live()).text()
  }

  async isDisabled(): Promise<boolean> {
    return (await this.locatorFor('button[data-key="1"]')()).getProperty<boolean>('disabled')
  }
}
