/**
 * The app notification API wire contract and the display helpers the message
 * center folds it with. The notification service that owns
 * `/app/v3/api/notification/notifications` is the authority for visibility,
 * ordering, and consumption; this module validates one response into the
 * display shape, orders it newest-first, and groups it by local calendar day.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-message-center/client/message-contract
 */

/** Notification kinds the API reports; `alert` is the highest severity. */
export type MessageType = 'info' | 'billing' | 'warning' | 'alert'

/** One notification as the message center renders it. */
export interface MessageItem {
  /** Stable server notification id; the acknowledge path segment. */
  readonly id: string
  /** Product application the notification belongs to. */
  readonly appId: string
  /** Headline. */
  readonly title: string
  /** One-line summary; empty when the server carries no summary. */
  readonly desc: string
  /** Full body; falls back to the summary when the body is empty. */
  readonly content: string
  /** Server publish time, as the notification database renders it. */
  readonly time: string
  /** Notification kind. */
  readonly type: MessageType
  /** Whether the signed-in user consumed this notification. */
  readonly read: boolean
  /** Whether the server marks this notification for a popup presentation. */
  readonly showAsPopup: boolean
  /** Whether the user already saw the popup presentation. */
  readonly popupSeen: boolean
  /** Whether the delivery was archived for this user. */
  readonly archived: boolean
  /** Optional product route the notification points at. */
  readonly actionUrl: string | null
}

/** One display page plus the server's continuation fact. */
export interface MessagePage {
  /** Supported notifications in server order; malformed entries are skipped. */
  readonly items: readonly MessageItem[]
  /** Whether another page exists. */
  readonly hasMore: boolean
}

/** One local-calendar-day bucket, newest day first. */
export interface MessageDayGroup {
  /** Local calendar day (`YYYY-MM-DD`) or the raw date prefix the server sent. */
  readonly day: string
  /** Newest-first notifications inside that day. */
  readonly items: readonly MessageItem[]
}

/** The response did not carry a notification page. */
export class MessageContractError extends Error {
  /**
   * @param message - the field that made the payload unusable.
   */
  constructor(message: string) {
    super(message)
    this.name = 'MessageContractError'
  }
}

const DAY_PREFIX = /^(\d{4}-\d{2}-\d{2})/

/**
 * Validate the payload returned by the list operation.
 * @param value - envelope payload (the `data` member), already unwrapped by the transport.
 * @returns the supported notifications and the continuation fact.
 * @throws {MessageContractError} when the payload is not a notification page.
 */
export function readMessagePage(value: unknown): MessagePage {
  if (!isRecord(value)) throw new MessageContractError('notification page is not an object')
  const { items, pageInfo } = value
  if (!Array.isArray(items)) throw new MessageContractError('notification page.items is not an array')
  const supported: MessageItem[] = []
  for (const entry of items) {
    const item = readMessageItem(entry)
    if (item === undefined) continue
    supported.push(item)
  }
  const info = isRecord(pageInfo) ? pageInfo : {}
  return { items: supported, hasMore: readHasMore(info) }
}

/**
 * @param value - one wire notification.
 * @returns the supported notification, or undefined when this row is unusable.
 */
function readMessageItem(value: unknown): MessageItem | undefined {
  if (!isRecord(value)) {
    reportSkip('notification is not an object')
    return undefined
  }
  const id = nonBlankString(value.id)
  const appId = nonBlankString(value.appId)
  const title = nonBlankString(value.title)
  const time = nonBlankString(value.time)
  const type = readMessageType(value.type)
  if (id === undefined || appId === undefined || title === undefined || time === undefined || type === undefined) {
    reportSkip('notification misses a required field')
    return undefined
  }
  const desc = stringOr(value.desc, '')
  const content = stringOr(value.content, '')
  return {
    id,
    appId,
    title,
    desc,
    content: content === '' ? desc : content,
    time,
    type,
    read: value.read === true,
    showAsPopup: value.showAsPopup === true,
    popupSeen: value.popupSeen === true,
    archived: value.archived === true,
    actionUrl: nonBlankString(value.actionUrl) ?? null,
  }
}

/**
 * @param value - server page info.
 * @returns whether a further page exists.
 */
function readHasMore(value: Record<string, unknown>): boolean {
  if (value.hasMore === true) return true
  const page = numberOr(value.page)
  const totalPages = numberOr(value.totalPages)
  return page !== undefined && totalPages !== undefined && page < totalPages
}

/**
 * Order notifications newest-first and bucket them by local calendar day.
 * Undated notifications sort last and group under the empty day, so they stay
 * reachable instead of disappearing.
 * @param items - notifications in any order.
 * @returns day groups, newest day first, each newest-first.
 */
export function groupMessagesByDay(
  items: readonly MessageItem[],
): readonly MessageDayGroup[] {
  const dated = items.map(item => ({ item, time: parseMessageTime(item.time) }))
  // Newest first, undated last; equal times keep the server order.
  dated.sort((left, right) => {
    if (left.time === null) return right.time === null ? 0 : 1
    return right.time === null ? -1 : right.time - left.time
  })
  const groups = new Map<string, MessageItem[]>()
  for (const { item, time } of dated) {
    const day = time === null ? DAY_PREFIX.exec(item.time)?.[1] ?? '' : localDayKey(new Date(time))
    const bucket = groups.get(day)
    if (bucket === undefined) groups.set(day, [item])
    else bucket.push(item)
  }
  return [...groups].map(([day, group]) => ({ day, items: group }))
}

/**
 * Read a notification's publish time.
 * @param value - server time text.
 * @returns the parsed epoch milliseconds, or null when the server sent no parsable time.
 */
export function parseMessageTime(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Resolve an action route the notification carries into a safe link target.
 * Only absolute HTTP(S) routes and site-relative paths are linkable; a
 * `javascript:`, `data:`, or other scheme never reaches an anchor.
 * @param value - server action route.
 * @returns the linkable value, or null when there is none.
 */
export function safeMessageActionUrl(value: string | null): string | null {
  if (value === null || value.trim() === '') return null
  try {
    const parsed = new URL(value, 'https://message-center.invalid')
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

/**
 * Format a date as the browser's local calendar day.
 * @param value - a local date.
 * @returns its `YYYY-MM-DD` calendar day in the browser's time zone.
 */
export function localDayKey(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${String(value.getFullYear())}-${month}-${day}`
}

/**
 * @param value - server notification kind.
 * @returns the supported kind, or undefined when the server reports one this client does not render.
 */
function readMessageType(value: unknown): MessageType | undefined {
  switch (value) {
    case 'info': return 'info'
    case 'billing': return 'billing'
    case 'warning': return 'warning'
    case 'alert': return 'alert'
    default: return undefined
  }
}

/**
 * @param value - a non-empty string, or undefined otherwise.
 */
function nonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * @param value - candidate string field.
 * @param fallback - value used when the field is not a string.
 */
function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * @param value - candidate numeric page field.
 */
function numberOr(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Report one unusable row without failing its valid neighbours.
 * @param reason - what made the row unusable.
 */
function reportSkip(reason: string): void {
  console.error(`[ui-sdkwork-message-center] skipping unsupported notification: ${reason}`)
}

/**
 * @param value - payload member.
 * @returns whether the value is a plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
