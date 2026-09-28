/**
 * Thrown by every port method when the platform rejects a call.
 *
 * The generated transport throws its own error type; capabilities must not have
 * to know it, so the SDK boundary normalizes once, here. The platform's problem
 * contract (`API_SPEC.md` section 15.2) is RFC 9457 plus a numeric `code`, and
 * both survive normalization: `status` is the HTTP status and `code` is the
 * platform code (for example `40103` for expired credentials).
 */
export class BirdCoder2ApiError extends Error {
  /** HTTP status of the rejected call. */
  readonly status: number
  /** Platform problem code, when the response carried one. */
  readonly code: number | undefined
  /** Server-owned request correlation id, when the response carried one. */
  readonly traceId: string | undefined

  constructor(
    message: string,
    options: { status: number; code?: number | undefined; traceId?: string | undefined; cause?: unknown },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'BirdCoder2ApiError'
    this.status = options.status
    this.code = options.code
    this.traceId = options.traceId
  }

  /**
   * Whether the caller's credentials lapsed rather than the request being wrong.
   *
   * A relayed conversation survives this: the client re-authenticates and
   * resumes from its event watermark instead of discarding local state.
   */
  get isAuthenticationFailure(): boolean {
    return this.status === 401 || this.status === 403
  }

  /**
   * Whether the lease the host holds has lapsed.
   *
   * `40902` is the platform's lease-inactive code; when a conversation returns
   * it, the remedy is to re-attach the host, not to retry the turn.
   */
  get isLeaseFailure(): boolean {
    return this.code === 40902
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Normalizes anything a transport throws into a {@link BirdCoder2ApiError}.
 *
 * Deliberately duck-typed: the generated transport's error class is an
 * implementation detail, and an abort must stay an abort so callers can ignore
 * a superseded request instead of surfacing it as a failure.
 */
export function toBirdCoder2ApiError(error: unknown): unknown {
  if (error instanceof BirdCoder2ApiError) {
    return error
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return error
  }
  if (typeof error !== 'object' || error === null) {
    return new BirdCoder2ApiError(String(error), { status: 0 })
  }

  const record = error as Record<string, unknown>
  const status = readNumber(record['status']) ?? readNumber(record['statusCode']) ?? 0
  const code = readNumber(record['code'])
  const traceId = readString(record['traceId'])
  const message = readString(record['message']) ?? 'BirdCoder2 request failed'

  return new BirdCoder2ApiError(message, {
    status,
    code,
    traceId,
    cause: error,
  })
}

/** Runs one port call, normalizing a transport rejection into the port error. */
export async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw toBirdCoder2ApiError(error)
  }
}
