import { Injectable, inject } from '@angular/core'
import type { CategoryTree } from '../../domain/category-tree'
import type { Account } from '../api/api-types'
import type { Me } from '../auth/auth.api'
import { readPreference, writePreference } from './local-preference'
import { WINDOW } from './window.token'

/**
 * localStorage keys. The `mm:` prefix makes `clearAppStorage` forget them
 * with everything else on logout and when the session expires.
 */
export const SESSION_CACHE_KEY = 'mm:offline:session'
export const DIRECTORY_CACHE_KEY = 'mm:offline:directory'

const VERSION = 1

/** What quick add needs to open offline: the household's accounts and category tree. */
export interface CachedDirectory {
  accounts: Account[]
  tree: CategoryTree
}

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownerKey(userId: number, householdId: number | null): string {
  return `${userId}:${householdId ?? 0}`
}

/**
 * The last session this device knew (the `GET /auth/me` body) and the
 * household directory, so the installed app can start without a network:
 * the shell opens on the cached session and quick add queues to the
 * outbox. Only one person's copy is ever kept: the directory is tied to
 * the person and household it was read for, and saving another person's
 * session drops it. Reads are tolerant (anything unreadable is no cache)
 * and a device that refuses to store is harmless.
 */
@Injectable({ providedIn: 'root' })
export class OfflineCache {
  private readonly window = inject(WINDOW)

  readSession(): Me | null {
    const me = this.read(SESSION_CACHE_KEY)?.['me']
    return isRecord(me) && isRecord(me['user']) && typeof me['user']['id'] === 'number'
      ? (me as unknown as Me)
      : null
  }

  writeSession(me: Me): void {
    const owner = ownerKey(me.user.id, me.household?.id ?? null)
    if (this.read(DIRECTORY_CACHE_KEY)?.['owner'] !== owner) {
      writePreference(this.window, DIRECTORY_CACHE_KEY, null)
    }
    this.write(SESSION_CACHE_KEY, { me })
  }

  /** The directory kept for this person in this household, or null. */
  readDirectory(userId: number, householdId: number): CachedDirectory | null {
    const stored = this.read(DIRECTORY_CACHE_KEY)
    if (stored?.['owner'] !== ownerKey(userId, householdId)) {
      return null
    }
    const { accounts, tree } = stored
    return Array.isArray(accounts) && Array.isArray(tree)
      ? { accounts: accounts as Account[], tree: tree as CategoryTree }
      : null
  }

  writeDirectory(userId: number, householdId: number, directory: CachedDirectory): void {
    this.write(DIRECTORY_CACHE_KEY, { owner: ownerKey(userId, householdId), ...directory })
  }

  clear(): void {
    writePreference(this.window, SESSION_CACHE_KEY, null)
    writePreference(this.window, DIRECTORY_CACHE_KEY, null)
  }

  private read(key: string): Json | null {
    try {
      const parsed: unknown = JSON.parse(readPreference(this.window, key) ?? 'null')
      return isRecord(parsed) && parsed['version'] === VERSION ? parsed : null
    } catch {
      return null
    }
  }

  private write(key: string, value: Json): void {
    // Refused (quota, private mode): the app simply cannot start offline.
    writePreference(this.window, key, JSON.stringify({ version: VERSION, ...value }))
  }
}
