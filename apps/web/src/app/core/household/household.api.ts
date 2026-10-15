import { Injectable, inject } from '@angular/core'
import type { Locale, MemberRole } from '@monkimoney/shared'
import { API } from '../api/api'

export interface HouseholdInput {
  name?: string
  locale?: Locale
  timezone?: string
}

/**
 * Data access for the current household (onboarding and settings share it):
 * the household itself, its members, invitations, export and deletion.
 */
@Injectable({ providedIn: 'root' })
export class HouseholdApi {
  private readonly api = inject(API)

  async show() {
    const { data } = await (await this.api()).request('household.show', {})
    return data
  }

  async update(body: HouseholdInput) {
    const { data } = await (await this.api()).request('household.update', { body })
    return data
  }

  async members() {
    const { data } = await (await this.api()).request('household.members', {})
    return data
  }

  async invitations() {
    const { data } = await (await this.api()).request('household.invitations.index', {})
    return data
  }

  /** Emails an invitation link (the link itself is never returned to the owner). */
  async invite(email: string, role: MemberRole = 'member') {
    const { data } = await (
      await this.api()
    ).request('household.invitations.store', {
      body: { email, role },
    })
    return data
  }

  /** Emails a fresh link for a pending invitation; the previous link stops working. */
  async resendInvitation(id: number): Promise<void> {
    await (await this.api()).request('household.invitations.resend', { params: { id } })
  }

  async revokeInvitation(id: number): Promise<void> {
    await (await this.api()).request('household.invitations.destroy', { params: { id } })
  }

  /** The JSON export as a file blob (the API streams it as an attachment). */
  async export(): Promise<Blob> {
    const blob: unknown = await (
      await this.api()
    ).request('household.export', { responseType: 'blob' })
    return blob as Blob
  }

  async scheduleDeletion(password: string) {
    const { data } = await (await this.api()).request('household.delete', { body: { password } })
    return data
  }

  async restore() {
    const { data } = await (await this.api()).request('household.restore', {})
    return data
  }
}
