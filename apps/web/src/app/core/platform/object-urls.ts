import { InjectionToken } from '@angular/core'

/** `blob:` URLs for local previews; a token so specs can count what is revoked. */
export interface ObjectUrls {
  create(blob: Blob): string
  revoke(url: string): void
}

export const OBJECT_URLS = new InjectionToken<ObjectUrls>('ObjectUrls', {
  providedIn: 'root',
  factory: () => ({
    create: (blob) => URL.createObjectURL(blob),
    revoke: (url) => URL.revokeObjectURL(url),
  }),
})
