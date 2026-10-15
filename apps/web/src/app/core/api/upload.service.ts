import { DOCUMENT, Injectable, InjectionToken, inject } from '@angular/core'
import { SessionExpiry } from './session-expiry'

/** Creates the request object; specs swap in a scripted fake. */
export const XHR_FACTORY = new InjectionToken<() => XMLHttpRequest>('XhrFactory', {
  providedIn: 'root',
  factory: () => () => new XMLHttpRequest(),
})

export interface UploadOptions {
  /** Share of the body sent so far (0..1); null while the browser cannot tell. */
  onProgress?: (fraction: number | null) => void
  /** Aborting cancels the request; the promise rejects with {@link UploadAbortedError}. */
  signal?: AbortSignal
}

/** Any HTTP answer (2xx or not): the caller reads the status and the JSON body. */
export interface UploadResponse {
  status: number
  /** The parsed JSON body, or null when there is none or it is not JSON. */
  body: unknown
}

/** The upload was cancelled through its AbortSignal. */
export class UploadAbortedError extends Error {
  constructor() {
    super('Upload cancelled')
    this.name = 'UploadAbortedError'
  }
}

/** No answer at all: offline, or the connection dropped. */
export class UploadNetworkError extends Error {
  constructor() {
    super('Upload failed: no connection')
    this.name = 'UploadNetworkError'
  }
}

/** The XSRF-TOKEN cookie the API sets on every response, decoded. */
function xsrfToken(cookies: string): string | null {
  const match = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(cookies)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function parseJson(text: string): unknown {
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/**
 * Multipart uploads with real progress, which fetch (and so the Tuyau
 * client) cannot report: an XMLHttpRequest to the same origin with the
 * CSRF header Tuyau would send (`X-XSRF-TOKEN` from the cookie), progress
 * events from `xhr.upload`, and cancellation through an AbortSignal. A 401
 * is reported to {@link SessionExpiry} like any other API call.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly document = inject(DOCUMENT)
  private readonly expiry = inject(SessionExpiry)
  private readonly createXhr = inject(XHR_FACTORY)

  post(path: string, body: FormData, options: UploadOptions = {}): Promise<UploadResponse> {
    const { signal, onProgress } = options
    return new Promise<UploadResponse>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new UploadAbortedError())
        return
      }
      const xhr = this.createXhr()
      const abort = () => xhr.abort()

      xhr.open('POST', path)
      xhr.setRequestHeader('Accept', 'application/json')
      const token = xsrfToken(this.document.cookie)
      if (token) {
        xhr.setRequestHeader('X-XSRF-TOKEN', token)
      }
      xhr.upload.onprogress = (event) =>
        onProgress?.(event.lengthComputable && event.total > 0 ? event.loaded / event.total : null)
      xhr.onload = () => {
        if (xhr.status === 401) {
          this.expiry.notify()
        }
        resolve({ status: xhr.status, body: parseJson(xhr.responseText) })
      }
      xhr.onerror = () => reject(new UploadNetworkError())
      xhr.ontimeout = () => reject(new UploadNetworkError())
      xhr.onabort = () => reject(new UploadAbortedError())
      xhr.onloadend = () => signal?.removeEventListener('abort', abort)
      signal?.addEventListener('abort', abort, { once: true })
      xhr.send(body)
    })
  }
}
