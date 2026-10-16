import env from '#start/env'
import { vapidSubject } from '#domain/push/vapid_subject'
import type { VapidSettings } from '#services/push/vapid_keys'

/**
 * Web Push (docs/RUNBOOK.md, "Push notifications").
 *
 * - VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY: the key pair, both or neither
 *   (start/env.ts). Neither = the app generates a pair once and keeps it in
 *   `app_settings`, the private key encrypted with APP_KEY.
 * - VAPID_SUBJECT: how push services reach us (mailto: or https:); empty =
 *   APP_URL when it is https.
 */
const pushConfig: VapidSettings = {
  publicKey: env.get('VAPID_PUBLIC_KEY') ?? null,
  privateKey: env.get('VAPID_PRIVATE_KEY') ?? null,
  subject: vapidSubject(env.get('VAPID_SUBJECT'), env.get('APP_URL')),
}

export default pushConfig
