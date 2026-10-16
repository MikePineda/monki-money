import webpush from 'web-push'
import type { Secret } from '@adonisjs/core/helpers'
import encryption from '@adonisjs/core/services/encryption'
import type AppSettings from '#services/settings/app_settings'

/** config/push.ts */
export interface VapidSettings {
  publicKey: string | null
  privateKey: Secret<string> | null
  /** The VAPID `sub` claim (mailto: or https:). */
  subject: string
}

/** What signs a push request. */
export interface VapidDetails {
  subject: string
  publicKey: string
  privateKey: string
}

export interface VapidKeyPair {
  publicKey: string
  privateKey: string
}

/** The pino methods this service uses (the app logger in production). */
export interface VapidLogger {
  info(context: Record<string, unknown>, message: string): void
  error(context: Record<string, unknown>, message: string): void
}

/** `app_settings` keys of the generated pair. */
export const VAPID_PUBLIC_KEY_SETTING = 'vapid_public_key'
export const VAPID_PRIVATE_KEY_SETTING = 'vapid_private_key'

/** Encryption purpose of the stored private key: no other ciphertext decrypts as one. */
const PRIVATE_KEY_PURPOSE = 'vapid-private-key'

/** The stored private key no longer decrypts (APP_KEY changed): see the runbook. */
export class VapidKeysUnreadable extends Error {
  constructor() {
    super(
      'The stored VAPID private key cannot be decrypted (APP_KEY changed?): ' +
        'delete the vapid_* rows of app_settings and the push subscriptions, then restart'
    )
  }
}

/**
 * The VAPID key pair Web Push is signed with. VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY win when set; otherwise the pair is generated once with
 * `web-push` and kept in `app_settings` (the private key encrypted with
 * APP_KEY through the app's encryption service), so production needs no
 * env edit and every container signs with the same pair. Resolved on first
 * use and cached for the life of the process; a failure is not cached.
 */
export default class VapidKeys {
  #resolved: Promise<VapidDetails> | null = null

  constructor(
    protected settings: VapidSettings,
    protected store: AppSettings,
    protected logger: VapidLogger,
    protected generate: () => VapidKeyPair = () => webpush.generateVAPIDKeys(),
    protected now: () => Date = () => new Date()
  ) {}

  /** The pair and subject, or null while push is unavailable (the reason is logged). */
  async details(): Promise<VapidDetails | null> {
    this.#resolved ??= this.resolve()
    try {
      return await this.#resolved
    } catch (error) {
      this.#resolved = null
      this.logger.error({ err: error }, 'push: no VAPID key pair, push is unavailable')
      return null
    }
  }

  /** What the browser subscribes with (`GET /config`), null while push is unavailable. */
  async publicKey(): Promise<string | null> {
    const details = await this.details()
    return details?.publicKey ?? null
  }

  protected async resolve(): Promise<VapidDetails> {
    const { publicKey, privateKey, subject } = this.settings
    if (publicKey && privateKey) return { subject, publicKey, privateKey: privateKey.release() }

    const stored = await this.stored()
    if (stored) return { subject, ...stored }

    const fresh = this.generate()
    const written = await this.store.putAllIfAbsent(
      {
        [VAPID_PUBLIC_KEY_SETTING]: fresh.publicKey,
        [VAPID_PRIVATE_KEY_SETTING]: encryption.encrypt(fresh.privateKey, {
          purpose: PRIVATE_KEY_PURPOSE,
        }),
      },
      this.now()
    )
    if (written) {
      this.logger.info({}, 'push: generated a VAPID key pair and stored it in app_settings')
      return { subject, ...fresh }
    }
    // Another container stored its pair first: use that one.
    const winner = await this.stored()
    if (!winner) throw new Error('The VAPID key pair vanished while it was being stored')
    return { subject, ...winner }
  }

  protected async stored(): Promise<VapidKeyPair | null> {
    const publicKey = await this.store.get(VAPID_PUBLIC_KEY_SETTING)
    const encrypted = await this.store.get(VAPID_PRIVATE_KEY_SETTING)
    if (!publicKey || !encrypted) return null
    const privateKey = encryption.decrypt<string>(encrypted, PRIVATE_KEY_PURPOSE)
    if (typeof privateKey !== 'string') throw new VapidKeysUnreadable()
    return { publicKey, privateKey }
  }
}
