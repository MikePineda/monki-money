import { Component, ElementRef, computed, inject, input } from '@angular/core'
import { IconComponent } from '../../icons/icon.component'
import type { IconName } from '../../icons/icon-names'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link' | 'destructive'
export type ButtonSize = 'inline' | 'block'

const BASE =
  'relative inline-flex items-center justify-center gap-2 rounded-md border text-body-strong ' +
  'whitespace-nowrap select-none transition-colors ' +
  'disabled:border-transparent disabled:bg-surface-2 disabled:text-ink-3 disabled:cursor-default ' +
  'aria-busy:pointer-events-none'

const VARIANTS: Record<ButtonVariant, string> = {
  // Primary is ink, never the accent (DESIGN.md, principle 3).
  primary: 'border-transparent bg-ink-1 text-surface-0 active:bg-ink-2',
  secondary: 'border-line-strong bg-surface-1 text-ink-1 active:bg-surface-2',
  ghost: 'border-transparent bg-transparent text-ink-1 active:bg-surface-2',
  link: 'border-transparent bg-transparent text-accent active:bg-surface-2',
  destructive: 'border-status-critical bg-surface-1 text-status-critical active:bg-surface-2',
}

/** 56px full width at the bottom of a screen, 44px for text-only actions, 48px otherwise. */
function sizeClasses(variant: ButtonVariant, size: ButtonSize): string {
  if (size === 'block') {
    return 'h-14 w-full px-5'
  }
  return variant === 'ghost' || variant === 'link' ? 'h-11 px-3' : 'h-12 px-5'
}

/**
 * The button (DESIGN.md, Button) on a native <button> or <a>, so forms,
 * focus and keyboard behave natively. 48px inline, 56px full width at the
 * bottom of a screen (`size="block"`). Loading keeps the label and the width
 * and swaps the leading icon for a spinner.
 */
@Component({
  selector: 'button[appButton], a[appButton]',
  imports: [IconComponent],
  template: `
    @if (loading()) {
      <app-icon name="loader-circle" [size]="16" class="animate-spin" />
    } @else if (leadingIcon(); as icon) {
      <app-icon [name]="icon" />
    }
    <span class="truncate"><ng-content /></span>
  `,
  host: {
    '[class]': 'classes()',
    '[attr.data-variant]': 'variant()',
    '[attr.aria-busy]': 'loading() || null',
  },
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary')
  readonly size = input<ButtonSize>('inline')
  readonly icon = input<IconName | null>(null)
  readonly loading = input(false)

  protected readonly leadingIcon = computed<IconName | null>(
    () => this.icon() ?? (this.variant() === 'destructive' ? 'trash-2' : null)
  )

  protected readonly classes = computed(
    () => `${BASE} ${VARIANTS[this.variant()]} ${sizeClasses(this.variant(), this.size())}`
  )

  constructor() {
    // A loading button swallows clicks, keyboard-triggered ones included. The
    // listener is added here, in the capture phase, so it runs before any
    // (click) handler the consumer binds on the same element.
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement
    element.addEventListener(
      'click',
      (event) => {
        if (this.loading()) {
          event.preventDefault()
          event.stopImmediatePropagation()
        }
      },
      { capture: true }
    )
  }
}
