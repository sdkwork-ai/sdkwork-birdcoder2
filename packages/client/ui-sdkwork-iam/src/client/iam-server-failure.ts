/**
 * Server-reported failure diagnostics for the browser-login card.
 *
 * The generated SDKs reject with `SdkError`s that carry the HTTP status, the
 * wire code, the trace id, and the RFC 9457 problem document the IAM endpoint
 * answered with. The desktop runtime keeps only the error message when it
 * wraps a failed step, so this module reads those fields structurally — this
 * page loads several SDK copies at once and their classes are not reliably
 * this module's classes — and serializes the problem document for the card's
 * details view.
 */

/** One server-answered failure, as the sign-in card's details view shows it. */
export interface IamServerFailureResponse {
  /** HTTP status the endpoint answered with. */
  status?: number
  /** Wire code: the problem document's `code`, else the transport error code. */
  code?: string
  /** Trace id correlating the response with the IAM server logs. */
  traceId?: string
  /** The complete problem document, serialized for display. */
  body?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Serialize one problem document without letting a circular or exotic value
 * break the failure report.
 * @param value - the parsed response document.
 * @returns the pretty-printed document, or undefined when it cannot be printed.
 */
function serializeDocument(value: Record<string, unknown>): string | undefined {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return undefined
  }
}

/**
 * Read the server's own report from one rejected request.
 *
 * Only a rejection the transport tagged with an HTTP status or a parsed
 * problem document came back from a server; a network failure, timeout, or
 * local validation carries neither, and an application error's own `code`
 * (the desktop runtime's `exchange-failed`, for example) is not a wire code.
 * @param error - the rejection an IAM transport threw.
 * @returns the status, codes, trace id, and problem document, or undefined when
 * the request produced no server response.
 */
export function readServerFailureResponse(error: unknown): IamServerFailureResponse | undefined {
  if (!isRecord(error)) return undefined
  const problem = isRecord(error.problem) ? error.problem : undefined
  const httpStatus = typeof error.httpStatus === 'number' ? error.httpStatus : undefined
  const problemStatus = problem !== undefined && typeof problem.status === 'number' ? problem.status : undefined
  const status = httpStatus ?? problemStatus
  if (status === undefined && problem === undefined) return undefined
  const problemCode = problem?.code
  const code = typeof problemCode === 'number'
    ? String(problemCode)
    : typeof problemCode === 'string' && problemCode !== '' ? problemCode : typeof error.code === 'string' ? error.code : undefined
  const traceId = typeof error.traceId === 'string' && error.traceId !== ''
    ? error.traceId
    : problem !== undefined && typeof problem.traceId === 'string' && problem.traceId !== '' ? problem.traceId : undefined
  const body = problem === undefined ? undefined : serializeDocument(problem)
  return {
    ...(status === undefined ? {} : { status }),
    ...(code === undefined ? {} : { code }),
    ...(traceId === undefined ? {} : { traceId }),
    ...(body === undefined ? {} : { body }),
  }
}
