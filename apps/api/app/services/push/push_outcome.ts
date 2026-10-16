import type { PushReport } from '#services/push/push_notifier'
import { RETRYABLE_FAILURE, type RunResult } from '#services/scheduler/scheduler_runs'

/**
 * A notification's run outcome in `scheduler_runs`: `sent` once any device
 * got it; a retryable failure (an hour later, see scheduler_runs.ts) when
 * none did and some failed; `skipped:no-device` when every device was gone.
 */
export function pushRunResult(report: PushReport): RunResult {
  if (report.sent > 0) {
    return { outcome: 'sent', error: report.errors.length > 0 ? report.errors.join('; ') : null }
  }
  if (report.failed > 0) return { outcome: RETRYABLE_FAILURE, error: report.errors.join('; ') }
  return { outcome: 'skipped:no-device' }
}

/** `sent to 2 devices, 1 gone` for the log line. */
export function describeReport(report: PushReport): string {
  const parts = [`sent to ${report.sent} device${report.sent === 1 ? '' : 's'}`]
  if (report.gone > 0) parts.push(`${report.gone} gone`)
  if (report.failed > 0) parts.push(`${report.failed} failed`)
  return parts.join(', ')
}
