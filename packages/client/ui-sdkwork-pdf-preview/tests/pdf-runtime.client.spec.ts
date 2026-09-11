// @vitest-environment jsdom
/** PDF.js loading: worker boot, options, teardown, fatal handling, and failure kinds. */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?raw', () => ({ default: 'WORKER-SOURCE' }))
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  PDFWorker: { create: vi.fn() },
}))

const { getDocument, PDFWorker } = (await import('pdfjs-dist')) as never as {
  getDocument: ReturnType<typeof vi.fn>
  PDFWorker: { create: ReturnType<typeof vi.fn> }
}
const { openPdf, PdfOpenError } = await import('../src/client/pdf/runtime.ts')

/** A rejected promise that stays quiet until its consumer attaches a handler. */
function quietReject(error: unknown): Promise<never> {
  // The kind-mapping table pins the non-Error rejection path on purpose.
  const rejected = Promise.reject(error) // oxlint-disable-line typescript/prefer-promise-reject-errors
  rejected.catch(() => {})
  return rejected
}

/** The worker double this suite installs; openPdf creates one per session. */
class FakeWorker extends EventTarget {
  static last: FakeWorker | undefined
  readonly url: string
  readonly terminate = vi.fn()

  constructor(url: string) {
    super()
    this.url = url
    FakeWorker.last = this
  }

  ready(): void {
    this.dispatchEvent(new MessageEvent('message', { data: { type: 'sdkwork-pdf-worker-ready' } }))
  }

  message(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  crash(): void {
    this.dispatchEvent(new Event('error'))
  }
}

/** Install the PDF.js doubles for one session; drives the deferred load task. */
function install(): {
  readonly resolveDocument: (document?: object) => void
  readonly taskDestroy: ReturnType<typeof vi.fn>
  readonly destroyBridge: ReturnType<typeof vi.fn>
} {
  // The runtime reads the build-injected asset table by default; provide it.
  vi.stubGlobal('__SDKWORK_PDFJS_ASSETS__', { cMapUrl: {}, standardFontDataUrl: {}, wasmUrl: {} })
  const taskDestroy = vi.fn()
  const destroyBridge = vi.fn()
  let settled = false
  const { promise, resolve, reject } = Promise.withResolvers<never>()
  taskDestroy.mockImplementation(() => {
    // A settled load task stays settled; a pending one dies as an abort.
    if (settled) return
    const abortError = new Error('Worker was destroyed')
    abortError.name = 'AbortException'
    reject(abortError)
  })
  vi.mocked(PDFWorker.create).mockReset()
  vi.mocked(PDFWorker.create).mockReturnValue({ destroy: destroyBridge })
  vi.mocked(getDocument).mockReset()
  vi.mocked(getDocument).mockImplementation(() => {
    void promise.then(() => { settled = true }, () => { settled = true })
    return { promise, destroy: taskDestroy } as never
  })
  return {
    resolveDocument: (document = { numPages: 3 }): void => { resolve(document as never) },
    taskDestroy,
    destroyBridge,
  }
}

/** Replace the URL statics the runtime uses; jsdom has no Blob URL support. */
function stubUrl(): { readonly revokeObjectURL: ReturnType<typeof vi.fn> } {
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:worker'), revokeObjectURL })
  return { revokeObjectURL }
}

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46])

describe('openPdf', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(getDocument).mockReset()
    vi.mocked(PDFWorker.create).mockReset()
  })

  it('boots an owned worker, opens through it, and tears everything down', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const { revokeObjectURL } = stubUrl()
    const { resolveDocument, taskDestroy, destroyBridge } = install()
    const onFatal = vi.fn()
    const session = openPdf(BYTES, new AbortController().signal, onFatal)

    // The worker is created before PDF.js is asked to open anything.
    expect(FakeWorker.last?.url).toBe('blob:worker')
    expect(getDocument).not.toHaveBeenCalled()
    FakeWorker.last?.ready()
    resolveDocument()
    const document = await session.document
    expect(document).toMatchObject({ numPages: 3 })

    const params = vi.mocked(getDocument).mock.calls[0]?.[0] as Record<string, unknown>
    expect(params.worker).toBeTruthy()
    expect(params.password).toBeUndefined()
    expect(params.enableXfa).toBe(false)
    expect(params.BinaryDataFactory).toBeTypeOf('function')
    // The worker receives a copy, so a retry can reuse the original bytes.
    expect(params.data).not.toBe(BYTES)
    expect(Array.from(params.data as Uint8Array)).toEqual(Array.from(BYTES))

    await session.dispose()
    expect(taskDestroy).toHaveBeenCalledTimes(1)
    expect(destroyBridge).toHaveBeenCalledTimes(1)
    expect(FakeWorker.last?.terminate).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:worker')
    // Teardown is idempotent.
    await session.dispose()
    expect(taskDestroy).toHaveBeenCalledTimes(1)
    expect(onFatal).not.toHaveBeenCalled()
  })

  it('hands an unlock password to PDF.js', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    const { resolveDocument } = install()
    const session = openPdf(BYTES, new AbortController().signal, vi.fn(), { password: 'secret' })
    FakeWorker.last?.ready()
    resolveDocument()
    await session.document
    expect((vi.mocked(getDocument).mock.calls[0]?.[0] as Record<string, unknown>).password).toBe('secret')
    await session.dispose()
  })

  it('answers resource requests from the inlined table without the network', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    const { resolveDocument } = install()
    const session = openPdf(BYTES, new AbortController().signal, vi.fn())
    FakeWorker.last?.ready()
    resolveDocument()
    await session.document
    const params = vi.mocked(getDocument).mock.calls[0]?.[0] as Record<string, unknown>
    const factory = params.BinaryDataFactory as new () => {
      fetch(request: { kind: string; filename: string }): Promise<Uint8Array>
    }
    await expect(new factory().fetch({ kind: 'cMapUrl', filename: 'missing' }))
      .rejects.toThrow('PDF.js asset is not bundled: cMapUrl/missing')
    await session.dispose()
  })

  it('fails loud when the worker never boots', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    const { taskDestroy } = install()
    const onFatal = vi.fn()
    const session = openPdf(BYTES, new AbortController().signal, onFatal, { bootTimeoutMs: 5 })
    await expect(session.document).rejects.toMatchObject({ kind: 'worker', message: 'the PDF worker did not start' })
    expect(FakeWorker.last?.terminate).toHaveBeenCalledTimes(1)
    expect(taskDestroy).not.toHaveBeenCalled()
    expect(onFatal).not.toHaveBeenCalled()
  })

  it('reports a worker that crashes before its ready message', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    const { taskDestroy } = install()
    const session = openPdf(BYTES, new AbortController().signal, vi.fn())
    FakeWorker.last?.crash()
    await expect(session.document).rejects.toMatchObject({ kind: 'worker' })
    expect(FakeWorker.last?.terminate).toHaveBeenCalledTimes(1)
    expect(taskDestroy).not.toHaveBeenCalled()
  })

  it('ignores unrelated worker messages while booting', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    const { resolveDocument } = install()
    const session = openPdf(BYTES, new AbortController().signal, vi.fn())
    FakeWorker.last?.message(undefined)
    FakeWorker.last?.message(null)
    FakeWorker.last?.message('noise')
    FakeWorker.last?.message({ type: 'something-else' })
    FakeWorker.last?.ready()
    resolveDocument()
    await session.document
    await session.dispose()
  })

  it('reports a worker that stops during loading and keeps its reason', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    const { taskDestroy } = install()
    const onFatal = vi.fn()
    const session = openPdf(BYTES, new AbortController().signal, onFatal)
    FakeWorker.last?.ready()
    // The crash only reaches the fatal listener once the boot has settled and
    // the session attached it; wait for the open to be in flight.
    await vi.waitFor(() => { expect(getDocument).toHaveBeenCalled() })
    FakeWorker.last?.crash()
    // A synchronous second crash meets the recorded failure and reports once.
    FakeWorker.last?.crash()
    expect(onFatal).toHaveBeenCalledTimes(1)
    expect(onFatal.mock.calls[0]?.[0]).toMatchObject({ kind: 'worker', message: 'the PDF worker stopped' })
    // The load rejects with the worker failure, not the teardown abort.
    await expect(session.document).rejects.toMatchObject({ kind: 'worker' })
    expect(taskDestroy).toHaveBeenCalledTimes(1)
    expect(FakeWorker.last?.terminate).toHaveBeenCalledTimes(1)
  })

  it('stays silent after the caller disposed first', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    const { resolveDocument } = install()
    const onFatal = vi.fn()
    const session = openPdf(BYTES, new AbortController().signal, onFatal)
    FakeWorker.last?.ready()
    resolveDocument()
    await session.document
    await session.dispose()
    FakeWorker.last?.crash()
    expect(onFatal).not.toHaveBeenCalled()
  })

  it('aborts a boot in progress when disposed', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    install()
    const session = openPdf(BYTES, new AbortController().signal, vi.fn())
    const pending = session.document
    void session.dispose()
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
    expect(FakeWorker.last?.terminate).toHaveBeenCalledTimes(1)
  })

  it('logs a teardown failure instead of throwing it', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    const { resolveDocument } = install()
    // Override the bridge after install, whose own mock has no failure.
    const destroyBridge = vi.fn((): never => { throw new Error('bridge boom') })
    vi.mocked(PDFWorker.create).mockReturnValue({ destroy: destroyBridge })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const session = openPdf(BYTES, new AbortController().signal, vi.fn())
    FakeWorker.last?.ready()
    resolveDocument()
    await session.document
    await expect(session.dispose()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith('[pdf] cleanup failed', expect.any(Error))
    error.mockRestore()
  })

  it('keeps a throwing failure callback from breaking teardown', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    install()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const session = openPdf(BYTES, new AbortController().signal, () => { throw new Error('listener boom') })
    FakeWorker.last?.ready()
    await vi.waitFor(() => { expect(getDocument).toHaveBeenCalled() })
    FakeWorker.last?.crash()
    // The session still carries the worker failure for anyone who awaits it.
    await expect(session.document).rejects.toMatchObject({ kind: 'worker' })
    expect(error).toHaveBeenCalledWith('[pdf] failure callback threw', expect.any(Error))
    error.mockRestore()
  })

  it.each([
    ['PasswordException', 'password'],
    ['InvalidPDFException', 'invalid'],
    ['MissingPDFException', 'invalid'],
    ['UnexpectedResponseException', 'unsupported'],
    ['ResponseException', 'unsupported'],
    ['AbortException', 'aborted'],
    ['Error', 'unsupported'],
  ])('maps a %s failure to %s', async (name, kind) => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    install()
    const session = openPdf(BYTES, new AbortController().signal, vi.fn())
    const failure = new Error('broken')
    failure.name = name
    vi.mocked(getDocument).mockImplementation(() => ({ promise: quietReject(failure), destroy: vi.fn() }) as never)
    FakeWorker.last?.ready()
    await expect(session.document).rejects.toMatchObject({ kind })
  })

  it('passes an open error through and explains a non-error rejection', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    stubUrl()
    install()
    const session = openPdf(BYTES, new AbortController().signal, vi.fn())
    vi.mocked(getDocument).mockImplementation(
      () => ({ promise: quietReject(new PdfOpenError('invalid', 'bad header')), destroy: vi.fn() }) as never,
    )
    FakeWorker.last?.ready()
    await expect(session.document).rejects.toMatchObject({ kind: 'invalid', message: 'bad header' })

    install()
    const second = openPdf(BYTES, new AbortController().signal, vi.fn())
    vi.mocked(getDocument).mockImplementation(() => ({ promise: quietReject('just a string'), destroy: vi.fn() }) as never)
    FakeWorker.last?.ready()
    await expect(second.document).rejects.toMatchObject({ kind: 'unsupported', message: 'just a string' })
  })
})

describe('worker construction failure', () => {
  it('surfaces an environment that cannot create workers', async () => {
    stubUrl()
    // A regular function called through `new` models the environment failure.
    vi.stubGlobal('Worker', function throwingWorker(): void {
      throw new Error('workers unavailable')
    })
    install()
    const session = openPdf(BYTES, new AbortController().signal, vi.fn())
    await expect(session.document).rejects.toMatchObject({ message: 'workers unavailable' })
  })
})
