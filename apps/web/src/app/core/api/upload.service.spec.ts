import { DOCUMENT } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { SessionExpiry } from './session-expiry'
import {
  UploadAbortedError,
  UploadNetworkError,
  UploadService,
  XHR_FACTORY,
} from './upload.service'

/** A scripted XMLHttpRequest: the test decides when bytes go out and what comes back. */
class FakeXhr {
  method = ''
  url = ''
  headers: Record<string, string> = {}
  sent: unknown = null
  status = 0
  responseText = ''
  aborted = false
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onloadend: (() => void) | null = null

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value
  }
  send(body: unknown): void {
    this.sent = body
  }
  abort(): void {
    this.aborted = true
    this.onabort?.()
    this.onloadend?.()
  }

  progress(loaded: number, total: number | null): void {
    this.upload.onprogress?.({
      loaded,
      total: total ?? 0,
      lengthComputable: total !== null,
    } as ProgressEvent)
  }
  respond(status: number, body: unknown): void {
    this.status = status
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
    this.onload?.()
    this.onloadend?.()
  }
  fail(): void {
    this.onerror?.()
    this.onloadend?.()
  }
}

describe('UploadService', () => {
  let xhr: FakeXhr
  let expiry: { notify: ReturnType<typeof vi.fn> }

  function setup(cookie = 'theme=dark; XSRF-TOKEN=abc%3D%3D; other=1') {
    xhr = new FakeXhr()
    expiry = { notify: vi.fn() }
    TestBed.configureTestingModule({
      providers: [
        { provide: XHR_FACTORY, useValue: () => xhr },
        { provide: SessionExpiry, useValue: expiry },
        { provide: DOCUMENT, useValue: { cookie } },
      ],
    })
    return TestBed.inject(UploadService)
  }

  it('test_posts_the_form_with_the_csrf_token_from_the_cookie', async () => {
    const service = setup()
    const form = new FormData()

    const answer = service.post('/api/v1/imports', form)
    xhr.respond(201, { data: [{ id: 1 }] })

    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('/api/v1/imports')
    expect(xhr.headers).toEqual({ 'Accept': 'application/json', 'X-XSRF-TOKEN': 'abc==' })
    expect(xhr.sent).toBe(form)
    await expect(answer).resolves.toEqual({ status: 201, body: { data: [{ id: 1 }] } })
  })

  it('test_reports_upload_progress_as_a_fraction_or_null_when_unknown', async () => {
    const service = setup()
    const progress: (number | null)[] = []

    const answer = service.post('/api/v1/imports', new FormData(), {
      onProgress: (value) => progress.push(value),
    })
    xhr.progress(512, 2048)
    xhr.progress(100, null)
    xhr.respond(201, { data: [] })
    await answer

    expect(progress).toEqual([0.25, null])
  })

  it('test_error_answers_resolve_with_their_status_and_body', async () => {
    const service = setup()

    const answer = service.post('/api/v1/imports', new FormData())
    xhr.respond(422, { code: 'E_CSV_EMPTY', message: 'Empty' })

    await expect(answer).resolves.toEqual({
      status: 422,
      body: { code: 'E_CSV_EMPTY', message: 'Empty' },
    })
  })

  it('test_a_body_that_is_not_json_resolves_as_null', async () => {
    const service = setup()

    const answer = service.post('/api/v1/imports', new FormData())
    xhr.respond(502, '<html>Bad gateway</html>')

    await expect(answer).resolves.toEqual({ status: 502, body: null })
  })

  it('test_a_401_tells_the_session_it_expired', async () => {
    const service = setup()

    const answer = service.post('/api/v1/imports', new FormData())
    xhr.respond(401, { errors: [{ message: 'Unauthorized' }] })
    await answer

    expect(expiry.notify).toHaveBeenCalledTimes(1)
  })

  it('test_aborting_cancels_the_request_and_rejects', async () => {
    const service = setup()
    const controller = new AbortController()

    const answer = service.post('/api/v1/imports', new FormData(), { signal: controller.signal })
    controller.abort()

    expect(xhr.aborted).toBe(true)
    await expect(answer).rejects.toBeInstanceOf(UploadAbortedError)
  })

  it('test_an_already_aborted_signal_never_sends', async () => {
    const service = setup()
    const controller = new AbortController()
    controller.abort()

    await expect(
      service.post('/api/v1/imports', new FormData(), { signal: controller.signal })
    ).rejects.toBeInstanceOf(UploadAbortedError)
    expect(xhr.sent).toBeNull()
  })

  it('test_a_network_failure_rejects_as_offline', async () => {
    const service = setup()

    const answer = service.post('/api/v1/imports', new FormData())
    xhr.fail()

    await expect(answer).rejects.toBeInstanceOf(UploadNetworkError)
  })

  it('test_no_csrf_header_without_the_cookie', async () => {
    const service = setup('theme=dark')

    const answer = service.post('/api/v1/imports', new FormData())
    xhr.respond(201, { data: [] })
    await answer

    expect(xhr.headers).toEqual({ Accept: 'application/json' })
  })
})
