import { Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { OnboardingStatus } from '../../../core/auth/onboarding-status'
import { SessionStore } from '../../../core/auth/session.store'
import { HouseholdApi } from '../../../core/household/household.api'
import { IconButtonComponent } from '../../../shared/ui/icon-button/icon-button.component'
import { ProgressTrackComponent } from '../../../shared/ui/progress-track/progress-track.component'
import { provideOnboardingScope } from '../onboarding.scope'
import { AccountsStepComponent } from './accounts-step.component'
import { HouseholdStepComponent } from './household-step.component'
import { InviteStepComponent } from './invite-step.component'
import { ONBOARDING_STEPS } from '../onboarding-steps'
import { RegionStepComponent } from './region-step.component'

/**
 * The onboarding wizard (< 2 minutes, 4 steps): household name, money and
 * time, accounts, partner invitation. Each step saves to the API as it goes
 * and the position is remembered on the device, so closing the app resumes
 * on the same step; the end is recorded on the household (`onboardedAt`),
 * so no device shows the wizard again. Full screen: no tab bar until the
 * household is set up.
 */
@Component({
  selector: 'app-onboarding-page',
  imports: [
    AccountsStepComponent,
    HouseholdStepComponent,
    IconButtonComponent,
    InviteStepComponent,
    ProgressTrackComponent,
    RegionStepComponent,
    TranslocoPipe,
  ],
  providers: [provideOnboardingScope()],
  template: `
    <div
      class="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-surface-0 pt-safe text-ink-1"
      data-testid="onboarding.page"
      [attr.data-step]="step() + 1"
    >
      <header class="flex h-14 items-center justify-between gap-4 pr-4 pl-1">
        @if (step() > 0) {
          <button
            appIconButton
            type="button"
            icon="arrow-left"
            data-testid="onboarding.back"
            [label]="'onboarding.back' | transloco"
            (click)="back()"
          ></button>
        } @else {
          <span class="size-11" aria-hidden="true"></span>
        }
        <div class="flex w-32 flex-col items-end gap-1.5">
          <p class="text-caption text-ink-2" data-testid="onboarding.stepLabel">
            {{ 'onboarding.step' | transloco: { current: step() + 1, total: total } }}
          </p>
          <app-progress-track
            class="w-full"
            [label]="'onboarding.step' | transloco: { current: step() + 1, total: total }"
            [steps]="total"
            [current]="step() + 1"
          />
        </div>
      </header>
      <main class="flex flex-1 flex-col px-gutter pt-6 pb-[max(24px,var(--safe-bottom))]">
        @switch (step()) {
          @case (0) {
            <app-household-step (done)="next()" />
          }
          @case (1) {
            <app-region-step (done)="next()" />
          }
          @case (2) {
            <app-accounts-step (done)="next()" />
          }
          @default {
            <app-invite-step (done)="finish()" />
          }
        }
      </main>
    </div>
  `,
})
export default class OnboardingPage {
  private readonly session = inject(SessionStore)
  private readonly status = inject(OnboardingStatus)
  private readonly households = inject(HouseholdApi)
  private readonly router = inject(Router)

  protected readonly total = ONBOARDING_STEPS
  private readonly householdId = computed(() => this.session.household()?.id ?? 0)
  protected readonly step = signal(
    Math.min(this.status.savedStep(this.householdId()), ONBOARDING_STEPS - 1)
  )

  constructor() {
    // Remember that the wizard is under way, so the app resumes it.
    this.status.saveStep(this.householdId(), this.step())
  }

  protected next(): void {
    this.go(this.step() + 1)
  }

  protected back(): void {
    this.go(this.step() - 1)
  }

  protected async finish(): Promise<void> {
    try {
      // On record for the household, so no other device opens the wizard again.
      this.session.patchHousehold(await this.households.completeOnboarding())
    } catch {
      // Offline or failing: this device still moves on (its accounts settle it elsewhere).
    }
    this.status.complete(this.householdId())
    await this.router.navigateByUrl('/month')
  }

  private go(step: number): void {
    const clamped = Math.max(0, Math.min(step, ONBOARDING_STEPS - 1))
    this.step.set(clamped)
    this.status.saveStep(this.householdId(), clamped)
  }
}
