import { Injectable, inject } from '@angular/core'
import type { Entitlements, HealthReport, Locale, PublicConfig, Theme } from '@monkimoney/shared'
import { API } from '../api/api'
import type { Household, Membership, User } from '../api/api-types'
import { unwrapData } from '../api/unwrap'

/** `GET /auth/me`: who is signed in, their household (if any) and what it may do. */
export interface Me {
  user: User
  household: Household | null
  membership: Membership | null
  entitlements: Entitlements | null
  flags: string[]
}

/** The Cloudflare Turnstile token, sent only while the API asks for the check. */
export interface BotCheck {
  turnstileToken?: string
}

export interface SignupInput extends BotCheck {
  fullName: string
  email: string
  password: string
  locale?: Locale
}

export interface LoginInput extends BotCheck {
  email: string
  password: string
}

export interface ForgotPasswordInput extends BotCheck {
  email: string
}

export interface ProfileInput {
  fullName?: string
  locale?: Locale
  theme?: Theme
  password?: string
  currentPassword?: string
}

export interface AcceptInvitationInput {
  fullName?: string
  password?: string
}

/**
 * Data access for the session and the public auth flows (login, sign-up,
 * email verification, password reset, invitations) plus the public config
 * and the health probe. Thin: every method is one typed Tuyau call.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly api = inject(API)

  async me(): Promise<Me> {
    return unwrapData<Me>(await (await this.api()).request('auth.me', {}))
  }

  async login(body: LoginInput): Promise<void> {
    await (await this.api()).request('auth.login', { body })
  }

  async logout(): Promise<void> {
    await (await this.api()).request('auth.logout', {})
  }

  async signup(body: SignupInput): Promise<void> {
    await (await this.api()).request('auth.signup', { body })
  }

  async verifyEmail(token: string): Promise<void> {
    await (await this.api()).request('auth.email.verify', { body: { token } })
  }

  async resendVerification(): Promise<void> {
    await (await this.api()).request('auth.email.resend', {})
  }

  async forgotPassword(body: ForgotPasswordInput): Promise<void> {
    await (await this.api()).request('auth.password.forgot', { body })
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await (await this.api()).request('auth.password.reset', { body: { token, password } })
  }

  async updateProfile(body: ProfileInput) {
    const { data } = await (await this.api()).request('me.update', { body })
    return data
  }

  async invitation(token: string) {
    const { data } = await (
      await this.api()
    ).request('auth.invitations.show', { params: { token } })
    return data
  }

  async acceptInvitation(token: string, body: AcceptInvitationInput): Promise<void> {
    await (await this.api()).request('auth.invitations.accept', { params: { token }, body })
  }

  async config(): Promise<PublicConfig> {
    const { data } = await (await this.api()).request('config.show', {})
    return data
  }

  async health(): Promise<HealthReport> {
    return (await this.api()).request('health.ready', {})
  }
}

export type InvitationPreview = Awaited<ReturnType<AuthApi['invitation']>>
