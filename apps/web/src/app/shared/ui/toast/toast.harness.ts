import { ComponentHarness } from '@angular/cdk/testing'

export class ToastHarness extends ComponentHarness {
  static hostSelector = 'app-toast'

  async getMessage(): Promise<string> {
    return (await this.locatorFor('p')()).text()
  }

  async getActionLabel(): Promise<string | null> {
    const action = await this.locatorForOptional('button:not([appIconButton])')()
    return action ? action.text() : null
  }

  async runAction(): Promise<void> {
    await (await this.locatorFor('button:not([appIconButton])')()).click()
  }

  async dismiss(): Promise<void> {
    await (await this.locatorFor('button[appIconButton]')()).click()
  }

  async getStatusIcon(): Promise<string | null> {
    const icon = await this.locatorForOptional('app-icon svg')()
    return icon ? icon.getAttribute('data-icon') : null
  }
}
