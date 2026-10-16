import { Component, computed, input, output } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslocoPipe } from '@jsverse/transloco'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ProgressTrackComponent } from '../../../shared/ui/progress-track/progress-track.component'
import type { ScanProblem, ScanStep } from '../scan.store'

/**
 * Keys read from TypeScript:
 * t(scan.capture.optimizing, scan.capture.presigning, scan.capture.uploading, scan.capture.scanning)
 * t(scan.capture.problem.notImage, scan.capture.problem.unreadablePhoto, scan.capture.problem.offline)
 * t(scan.capture.problem.quota, scan.capture.problem.unavailable, scan.capture.problem.unreadable)
 * t(scan.capture.problem.throttled, scan.capture.problem.upload, scan.capture.problem.failed)
 * t(scan.capture.problem.tooLarge, scan.capture.problem.wrongType)
 * t(scan.capture.problem.unsupportedFormat)
 */
const STATUS_KEYS: Partial<Record<ScanStep['step'], string>> = {
  optimizing: 'scan.capture.optimizing',
  presigning: 'scan.capture.presigning',
  uploading: 'scan.capture.uploading',
  scanning: 'scan.capture.scanning',
}

/** Problems where adding the expense by hand is the useful next step. */
const MANUAL: ReadonlySet<ScanProblem> = new Set(['quota', 'unavailable'])

/**
 * The capture half of `/scan`: two ways in (the camera, with
 * `capture="environment"`, or the photo library), the picked photo as a
 * thumbnail while it is read, the progress of each step with "Cancel", and
 * what went wrong with "Try again" when the same photo is worth sending
 * again. Presentational: the page's ScanStore does the work.
 */
@Component({
  selector: 'app-scan-capture',
  imports: [BannerComponent, ButtonComponent, ProgressTrackComponent, RouterLink, TranslocoPipe],
  template: `
    <section class="flex flex-1 flex-col gap-6 px-4 pt-2 pb-8">
      @if (preview(); as src) {
        <img
          class="mx-auto max-h-[45dvh] w-auto max-w-full rounded-lg border border-line object-contain"
          data-testid="scan.capture.preview"
          [src]="src"
          [alt]="'scan.capture.preview' | transloco"
        />
      } @else if (!problem()) {
        <p class="text-body text-ink-2" data-testid="scan.capture.intro">
          {{ 'scan.capture.intro' | transloco }}
        </p>
      }

      @if (statusKey(); as key) {
        <div class="flex flex-col gap-3" data-testid="scan.capture.progress">
          <p class="text-body text-ink-1" role="status" data-testid="scan.capture.status">
            {{ key | transloco }}
          </p>
          <app-progress-track
            [value]="progress()"
            [label]="'scan.capture.progressLabel' | transloco"
          />
          <button
            appButton
            variant="secondary"
            type="button"
            data-testid="scan.capture.cancel"
            (click)="cancelled.emit()"
          >
            {{ 'scan.capture.cancel' | transloco }}
          </button>
        </div>
      }

      @if (problem(); as current) {
        <div class="flex flex-col gap-3">
          <app-banner
            status="critical"
            data-testid="scan.capture.problem"
            [attr.data-problem]="current.problem"
            [message]="problemKey() | transloco: { format: current.format ?? '' }"
          />
          @if (current.retryable) {
            <button
              appButton
              variant="secondary"
              type="button"
              icon="refresh-cw"
              data-testid="scan.capture.retry"
              (click)="retried.emit()"
            >
              {{ 'scan.capture.retry' | transloco }}
            </button>
          }
          @if (manual()) {
            <a
              appButton
              variant="ghost"
              routerLink="/add"
              class="self-start"
              data-testid="scan.capture.manual"
            >
              {{ 'scan.capture.manual' | transloco }}
            </a>
          }
        </div>
      }
    </section>

    @if (!statusKey()) {
      <footer
        class="sticky bottom-0 flex flex-col gap-2 bg-surface-0 px-4 pt-2 pb-[max(16px,var(--safe-bottom))]"
      >
        <input
          #camera
          type="file"
          accept="image/*"
          capture="environment"
          class="sr-only"
          tabindex="-1"
          aria-hidden="true"
          data-testid="scan.capture.cameraInput"
          (change)="onFile($event)"
        />
        <input
          #library
          type="file"
          accept="image/*"
          class="sr-only"
          tabindex="-1"
          aria-hidden="true"
          data-testid="scan.capture.libraryInput"
          (change)="onFile($event)"
        />
        <button
          appButton
          type="button"
          size="block"
          icon="camera"
          data-testid="scan.capture.camera"
          (click)="camera.click()"
        >
          {{ (problem() ? 'scan.capture.another' : 'scan.capture.camera') | transloco }}
        </button>
        <button
          appButton
          variant="secondary"
          type="button"
          icon="image"
          data-testid="scan.capture.library"
          (click)="library.click()"
        >
          {{ 'scan.capture.library' | transloco }}
        </button>
        <p class="pt-1 text-center text-caption text-ink-3">
          {{ 'scan.capture.privacy' | transloco }}
        </p>
      </footer>
    }
  `,
  host: { class: 'flex flex-1 flex-col' },
})
export class ScanCaptureComponent {
  readonly step = input.required<ScanStep>()
  /** The picked photo's local `blob:` URL while it is read. */
  readonly preview = input<string | null>(null)
  readonly picked = output<File>()
  readonly retried = output<void>()
  readonly cancelled = output<void>()

  protected readonly statusKey = computed(() => STATUS_KEYS[this.step().step] ?? null)
  /** Upload progress 0..1; the other steps have no measure (indeterminate). */
  protected readonly progress = computed(() => {
    const step = this.step()
    return step.step === 'uploading' ? step.progress : null
  })
  protected readonly problem = computed(() => {
    const step = this.step()
    return step.step === 'error' ? step : null
  })
  /** What went wrong; a photo the browser cannot open names its format when that is why. */
  protected readonly problemKey = computed(() => {
    const problem = this.problem()
    if (problem === null) {
      return ''
    }
    return problem.format
      ? 'scan.capture.problem.unsupportedFormat'
      : `scan.capture.problem.${problem.problem}`
  })
  protected readonly manual = computed(() => {
    const problem = this.problem()
    return problem !== null && MANUAL.has(problem.problem)
  })

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    // Clearing lets the same photo be picked again after a failure.
    input.value = ''
    if (file) {
      this.picked.emit(file)
    }
  }
}
