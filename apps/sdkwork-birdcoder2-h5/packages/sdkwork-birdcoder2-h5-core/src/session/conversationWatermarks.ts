/**
 * Per-conversation event watermarks.
 *
 * This is the mobile end of the relay protocol: the host runtime pushes agent
 * events into the platform, and the client reads them from an ordered log by
 * passing the last `sequence` it applied. Persisting that watermark is what makes
 * a reload or a dropped mobile connection a *resume* instead of a replay —
 * without it the client would re-read the transcript from the beginning and
 * re-render every delta.
 *
 * Stored through the bound host adapter, so the native shell gets durable
 * storage and the browser fallback gets process-local memory without either the
 * capability package or this module knowing which one is installed.
 */

import { getHostAdapters, type SecureStorageHostAdapter } from '../host/index.ts'

/** Storage key holding the watermark map. */
export const BIRDCODER2_H5_WATERMARK_KEY = 'birdcoder2.h5.event-watermark.v1'

/** A conversation's resume point. */
export interface ConversationWatermark {
  /** Last applied event `sequence`; the next read uses it as `afterSequence`. */
  readonly sequence: string
  /** When the client recorded it, in epoch milliseconds. */
  readonly recordedAt: number
}

/** The watermark map, keyed by conversation identifier. */
export type ConversationWatermarks = Readonly<Record<string, ConversationWatermark>>

function parseWatermarks(raw: string | undefined): ConversationWatermarks {
  if (raw === undefined) {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // A truncated write must not wedge the client on a corrupt blob: an empty
    // map only costs one replay, while throwing would block the conversation.
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {}
  }

  const result: Record<string, ConversationWatermark> = {}
  for (const [sessionId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) {
      continue
    }
    const record = value as Record<string, unknown>
    const sequence = record['sequence']
    const recordedAt = record['recordedAt']
    if (typeof sequence !== 'string' || typeof recordedAt !== 'number') {
      continue
    }
    result[sessionId] = { sequence, recordedAt }
  }
  return result
}

/** Reads the stored watermark map. */
export async function readConversationWatermarks(
  storage: SecureStorageHostAdapter = getHostAdapters().secureStorage,
): Promise<ConversationWatermarks> {
  return parseWatermarks(await storage.read(BIRDCODER2_H5_WATERMARK_KEY))
}

/** Reads one conversation's resume point, or `undefined` before the first read. */
export async function readConversationWatermark(
  sessionId: string,
  storage: SecureStorageHostAdapter = getHostAdapters().secureStorage,
): Promise<string | undefined> {
  const watermarks = await readConversationWatermarks(storage)
  return watermarks[sessionId]?.sequence
}

/**
 * Records a conversation's resume point.
 *
 * Callers pass the `nextCursor` a page returned, so the watermark only ever moves
 * forward over events the client actually applied.
 */
export async function writeConversationWatermark(
  sessionId: string,
  sequence: string,
  storage: SecureStorageHostAdapter = getHostAdapters().secureStorage,
  now: number = Date.now(),
): Promise<void> {
  const watermarks = await readConversationWatermarks(storage)
  const next: Record<string, ConversationWatermark> = { ...watermarks }
  next[sessionId] = { sequence, recordedAt: now }
  await storage.write(BIRDCODER2_H5_WATERMARK_KEY, JSON.stringify(next))
}

/** Clears one conversation's resume point, for example after deleting it. */
export async function clearConversationWatermark(
  sessionId: string,
  storage: SecureStorageHostAdapter = getHostAdapters().secureStorage,
): Promise<void> {
  const watermarks = await readConversationWatermarks(storage)
  if (!(sessionId in watermarks)) {
    return
  }
  const next: Record<string, ConversationWatermark> = { ...watermarks }
  delete next[sessionId]
  await storage.write(BIRDCODER2_H5_WATERMARK_KEY, JSON.stringify(next))
}
