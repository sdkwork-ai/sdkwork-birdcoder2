/**
 * PDF.js loading, owned by this preview.
 *
 * The dynamic client bundle has no module URL, so both the Worker source and
 * the font-mapping and image-decoder assets this build's PDF.js version needs
 * are inlined at build time. Opening a document therefore allocates one module
 * Worker from a Blob URL, adapts it to PDF.js through an explicit port, and
 * answers every resource request from the inlined table — never from the
 * network. A worker that fails to start, or that stops after opening, is
 * reported as a failure the reader can act on; nothing is retried silently on
 * the main thread.
 */
import { getDocument, PDFWorker } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { createPdfAssetFactory } from './assets.ts'

/** The document operations the preview uses. */
export type PdfDocument = Pick<PDFDocumentProxy, 'numPages' | 'getPage' | 'getMetadata'>

/** The message the owned worker posts once its module graph has evaluated. */
const WORKER_READY = 'sdkwork-pdf-worker-ready'

/** How long the worker has to evaluate its module graph before opening fails. */
const DEFAULT_BOOT_TIMEOUT_MS = 15_000

/** Why a document could not be opened, as the preview reports it. */
export type PdfFailureKind = 'worker' | 'invalid' | 'password' | 'unsupported' | 'aborted'

/** An open failure the preview renders as a specific explanation. */
export class PdfOpenError extends Error {
  constructor(readonly kind: PdfFailureKind, message: string) {
    super(message)
    this.name = 'PdfOpenError'
  }
}

/** Open-time options: an unlock password and the worker boot deadline. */
export interface PdfOpenOptions {
  /** Password for an encrypted document; an incorrect one fails as `password`. */
  readonly password?: string
  /** Longest wait for the worker's ready message; the default suits production. */
  readonly bootTimeoutMs?: number
}

/** One in-flight document open and its complete cleanup. */
export interface PdfSession {
  readonly document: Promise<PdfDocument>
  /**
   * Cancel loading and rendering and release the worker and its Blob URL.
   * @returns cleanup completion; teardown failures are logged, never rethrown.
   */
  dispose(): Promise<void>
}

/**
 * Classify a PDF.js failure into the explanation the reader needs.
 * @param error - the thrown value.
 * @returns the failure kind.
 */
function kindOf(error: unknown): PdfFailureKind {
  if (error instanceof PdfOpenError) return error.kind
  const name = error instanceof Error ? error.name : ''
  if (name === 'PasswordException') return 'password'
  if (name === 'InvalidPDFException' || name === 'MissingPDFException') return 'invalid'
  if (name === 'UnexpectedResponseException' || name === 'ResponseException') return 'unsupported'
  if (name === 'AbortException') return 'aborted'
  return 'unsupported'
}

/**
 * Open complete PDF bytes with a Worker this preview owns.
 * @param data - the complete file; the worker receives a copy.
 * @param signal - the body's lifetime.
 * @param onFatal - reports a worker failure that happens after opening.
 * @param options - the unlock password and the worker boot deadline.
 * @returns the pending document and its idempotent cleanup.
 */
export function openPdf(
  data: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
  onFatal: (error: PdfOpenError) => void,
  options: PdfOpenOptions = {},
): PdfSession {
  const lifetime = new AbortController()
  const stopped = AbortSignal.any([signal, lifetime.signal])
  const bootTimeoutMs = options.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS
  let workerUrl: string | undefined
  let native: Worker | undefined
  let bridge: PDFWorker | undefined
  let loading: ReturnType<typeof getDocument> | undefined
  let closing: Promise<void> | undefined
  let reported = false
  let fatalError: PdfOpenError | undefined

  const dispose = (): Promise<void> => {
    if (closing !== undefined) return closing
    closing = Promise.resolve().then(async () => {
      try {
        if (loading !== undefined) await loading.destroy()
      } finally {
        lifetime.abort()
        bridge?.destroy()
        if (native !== undefined) {
          native.removeEventListener('error', fatal)
          native.removeEventListener('messageerror', fatal)
          native.terminate()
        }
        if (workerUrl !== undefined) URL.revokeObjectURL(workerUrl)
      }
    }).catch((error: unknown) => { console.error('[pdf] cleanup failed', error) })
    return closing
  }

  function fatal(): void {
    if (fatalError === undefined) fatalError = new PdfOpenError('worker', 'the PDF worker stopped')
    void dispose()
    if (reported || stopped.aborted) return
    reported = true
    try {
      onFatal(fatalError)
    } catch (failure) {
      console.error('[pdf] failure callback threw', failure)
      void failure
    }
  }

  /** Boot the Worker and wait until its module graph has evaluated. */
  const boot = async (): Promise<Worker> => {
    stopped.throwIfAborted()
    const source = `${workerSource}\nself.postMessage({type:${JSON.stringify(WORKER_READY)}});\n`
    workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const created = new Worker(workerUrl, { type: 'module', name: 'sdkwork-pdf' })
    try {
      await new Promise<void>((resolve, reject) => {
        const aborted = new Error('the open was aborted')
        aborted.name = 'AbortException'
        const ready = (event: MessageEvent<unknown>): void => {
          const payload = event.data
          if (typeof payload !== 'object' || payload === null) return
          if ((payload as { type?: unknown }).type !== WORKER_READY) return
          settle()
          resolve()
        }
        const fail = (): void => {
          settle()
          reject(new PdfOpenError('worker', 'the PDF worker did not start'))
        }
        const onAbort = (): void => {
          settle()
          reject(aborted)
        }
        const settle = (): void => {
          created.removeEventListener('message', ready)
          created.removeEventListener('error', fail)
          created.removeEventListener('messageerror', fail)
          stopped.removeEventListener('abort', onAbort)
          clearTimeout(timer)
        }
        const timer = setTimeout(fail, bootTimeoutMs)
        created.addEventListener('message', ready)
        created.addEventListener('error', fail)
        created.addEventListener('messageerror', fail)
        stopped.addEventListener('abort', onAbort, { once: true })
      })
    } catch (error: unknown) {
      created.terminate()
      URL.revokeObjectURL(workerUrl)
      workerUrl = undefined
      throw error
    }
    return created
  }

  const initialize = async (): Promise<PdfDocument> => {
    const port = await boot()
    native = port
    native.addEventListener('error', fatal)
    native.addEventListener('messageerror', fatal)
    bridge = PDFWorker.create({ port })
    loading = getDocument({
      data: data.slice(),
      worker: bridge,
      BinaryDataFactory: createPdfAssetFactory(),
      cMapPacked: true,
      useWorkerFetch: false,
      enableXfa: false,
      stopAtErrors: true,
      password: options.password,
    })
    stopped.throwIfAborted()
    return await loading.promise
  }

  const document = initialize().catch(async (error: unknown) => {
    await dispose()
    // A teardown triggered by a worker failure rejects the load with an
    // unrelated abort error; the reader needs the worker reason instead.
    if (fatalError !== undefined) throw fatalError
    throw new PdfOpenError(kindOf(error), error instanceof Error ? error.message : String(error))
  })
  return { document, dispose }
}

/** The inlined worker source, supplied by this package's build configuration. */
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw'
