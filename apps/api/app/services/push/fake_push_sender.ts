import type { PushPayload } from '#domain/push/push_payload'
import {
  PushSender,
  type PushDelivery,
  type PushOptions,
  type PushTarget,
} from '#services/push/push_sender'

export interface RecordedPush {
  endpoint: string
  payload: PushPayload
  options: PushOptions
}

/**
 * Test double (bound under NODE_ENV=test, swapped per test with
 * `fakePush()`): records every message and answers `sent`, or what
 * `answer(endpoint, delivery)` scripted for that endpoint (`gone` for a
 * 410, `failed`...). Nothing leaves the process.
 */
export default class FakePushSender extends PushSender {
  readonly sent: RecordedPush[] = []
  readonly #answers = new Map<string, PushDelivery>()

  answer(endpoint: string, delivery: PushDelivery): this {
    this.#answers.set(endpoint, delivery)
    return this
  }

  async send(
    target: PushTarget,
    payload: PushPayload,
    options: PushOptions
  ): Promise<PushDelivery> {
    this.sent.push({ endpoint: target.endpoint, payload, options })
    return this.#answers.get(target.endpoint) ?? { status: 'sent' }
  }

  /** The messages that reached `endpoint`, oldest first. */
  to(endpoint: string): PushPayload[] {
    return this.sent.filter((push) => push.endpoint === endpoint).map((push) => push.payload)
  }
}
