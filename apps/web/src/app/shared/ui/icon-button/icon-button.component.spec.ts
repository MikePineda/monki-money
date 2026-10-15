import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { IconButtonComponent } from './icon-button.component'

@Component({
  imports: [IconButtonComponent],
  template: `
    <button
      appIconButton
      type="button"
      icon="x"
      label="Close"
      (click)="clicks.update((n) => n + 1)"
    ></button>
    <button
      appIconButton
      type="button"
      icon="table-2"
      label="Table view"
      [pressed]="pressed()"
    ></button>
  `,
})
class Host {
  readonly clicks = signal(0)
  readonly pressed = signal(false)
}

describe('IconButtonComponent', () => {
  it('test_has_an_accessible_name_and_a_44px_target', async () => {
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement
    expect(button.getAttribute('aria-label')).toBe('Close')
    expect(button.className).toContain('size-11')
    expect(button.hasAttribute('aria-pressed')).toBe(false)

    button.click()
    expect(fixture.componentInstance.clicks()).toBe(1)
  })

  it('test_toggle_reports_its_pressed_state', async () => {
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const toggle = fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    fixture.componentInstance.pressed.set(true)
    await fixture.whenStable()

    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.className).toContain('bg-surface-2')
  })
})
