/**
 * Browser transport for the SDKWork app notification API.
 *
 * The notification service behind `/app/v3/api/notification/notifications`
 * owns visibility, ordering, and consumption; clients reach it with the
 * SDKWork dual-token credential headers. The platform derives the application
 * context from the credential, so requests must not send `app_id` (the gateway
 * rejects a client-supplied context selector). This transport therefore sends
 * only pagination plus the acknowledge path id, unwraps the
 * `{ code, data, traceId }` envelope through the shared SDKWork client, and
 * classifies failures for the presentation layer.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-message-center/client/message-transport
 */
import {
  createBaseHttpClient,
  createTokenManager,
  type BaseHttpClient,
} from '@sdkwork/sdk-common'

/** Resource path of the app notification collection. */
const NOTIFICATION_PATH = '/app/v3/api/notification/notifications'

/** Per-request ceiling; a notification page is tiny and a stuck request must not hold the badge. */
const REQUEST_TIMEOUT_MS = 20_000

/** The credential pair the shared SDKWork clients send on an app-api request. */
export interface MessageCenterCredentials {
  /** Tenant-isolation access token (`Access-Token` header). */
  readonly accessToken?: string
  /** Login token (`Authorization: Bearer` header). */
  readonly authToken?: string
}

/** The operations the message center performs against the notification service. */
export interface MessageCenterTransport {
  /**
   * @param page - one-based page number.
   * @param pageSize - notifications requested per page.
   * @returns the unwrapped `data` member of the list response.
   */
  list(page: number, pageSize: number): Promise<unknown>
  /**
   * Mark one notification consumed for the signed-in user.
   * @param id - server notification id.
   */
  acknowledge(id: string): Promise<void>
}

/** Construction facts for the HTTP transport. */
export interface MessageCenterTransportOptions {
  /** Active deployment's app-api gateway origin. */
  readonly baseUrl: string
  /**
   * Current credential pair. Read before every request, so a token refresh
   * reaches the next call instead of the manager snapshot taken at creation.
   */
  readonly credentials: () => MessageCenterCredentials
}

/**
 * Build the notification transport over the shared SDKWork HTTP client.
 * @param options - gateway origin and the live credential reader.
 * @returns the list and acknowledge operations.
 */
export function createMessageCenterTransport(options: MessageCenterTransportOptions): MessageCenterTransport {
  const tokenManager = createTokenManager()
  const client: BaseHttpClient = createBaseHttpClient({
    baseUrl: options.baseUrl,
    tokenManager,
    timeout: REQUEST_TIMEOUT_MS,
    // The message center owns its retry cadence (the next poll, or an explicit
    // retry); the client must not hide a failure behind delayed attempts.
    retry: { maxRetries: 0 },
    logger: { level: 'error' },
  })
  const send = (): BaseHttpClient => {
    tokenManager.setTokens(options.credentials())
    return client
  }
  return {
    list: (page, pageSize) => send().get<unknown>(NOTIFICATION_PATH, { page, page_size: pageSize }),
    acknowledge: async (id) => {
      await send().post<unknown>(`${NOTIFICATION_PATH}/${encodeURIComponent(id)}/acknowledge`)
    },
  }
}

/** How a failed notification request reads to the message center. */
export type MessageLoadFailure = 'unauthorized' | 'unavailable' | 'unknown'

/** Gateway problem code for a request refused by the CORS policy, not by the session. */
const CORS_PROBLEM_CODE = 40301

/** SDKWork error codes that mean the gateway or the network was unreachable. */
const UNAVAILABLE_CODES: readonly string[] = [
  'NETWORK_ERROR',
  'TIMEOUT',
  'SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
  'BAD_GATEWAY',
  'GATEWAY_TIMEOUT',
]

/**
 * Classify a transport failure for the presentation layer.
 * @param error - the rejection raised by the transport.
 * @returns `unauthorized` when the gateway refused the session, `unavailable`
 * when the network or gateway failed, `unknown` otherwise.
 */
export function classifyMessageFailure(error: unknown): MessageLoadFailure {
  if (error instanceof TypeError) return 'unavailable'
  const status = readNumber(error, 'httpStatus')
  if (status === 401) return 'unauthorized'
  if (status === 403) {
    // A CORS refusal carries the same status as a permission refusal but is a
    // deployment problem, so it must not offer a sign-in the user already has.
    return readNumber(readMember(error, 'problem'), 'code') === CORS_PROBLEM_CODE ? 'unavailable' : 'unauthorized'
  }
  if (status !== undefined && status >= 500) return 'unavailable'
  const code = readString(error, 'code')
  if (code !== undefined && UNAVAILABLE_CODES.includes(code)) return 'unavailable'
  return 'unknown'
}

/**
 * @param value - candidate error.
 * @param key - member name.
 * @returns the member value, or undefined when the value does not carry it.
 */
function readMember(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !(key in value)) return undefined
  return (value as Record<string, unknown>)[key]
}

/**
 * @param value - candidate error.
 * @param key - numeric member name.
 */
function readNumber(value: unknown, key: string): number | undefined {
  const member = readMember(value, key)
  return typeof member === 'number' && Number.isFinite(member) ? member : undefined
}

/**
 * @param value - candidate error.
 * @param key - string member name.
 */
function readString(value: unknown, key: string): string | undefined {
  const member = readMember(value, key)
  return typeof member === 'string' ? member : undefined
}
