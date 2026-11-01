import type { GoalStatus } from '@monkimoney/shared'

/**
 * When the "you reached {goal}" push goes out. Pure: the goal's status,
 * whether its current reach was announced (`reached_notified_at` set) and
 * what is still missing are passed in.
 *
 * - `announce`: an active goal with nothing left to save whose reach nobody
 *   was told about. A goal someone marked reached, or archived, is never
 *   announced: they already know, or put it away.
 * - `rearm`: an announced goal that is short of its target again (money
 *   taken out, the target raised). The next time it gets there is a new
 *   reach and is announced again; while it stays at the target, however
 *   many times it is read, it is not.
 * - `none`: nothing to do.
 */
export type ReachAction = 'announce' | 'rearm' | 'none'

export type ReachState = {
  status: GoalStatus
  /** The current reach was announced (`reached_notified_at` is set). */
  notified: boolean
  /** What is still missing, never negative. */
  remainingCents: number
}

export function reachAction({ status, notified, remainingCents }: ReachState): ReachAction {
  if (remainingCents > 0) return notified ? 'rearm' : 'none'
  return status === 'active' && !notified ? 'announce' : 'none'
}
