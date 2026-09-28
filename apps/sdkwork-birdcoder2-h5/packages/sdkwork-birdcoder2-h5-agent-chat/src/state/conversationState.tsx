/**
 * Agent conversation state.
 *
 * The relay model this provider implements, end to end:
 *
 * 1. A conversation is bound to exactly one enrolled host, because the agent
 *    runtime executes there and not on the phone.
 * 2. The user's turn is submitted through the app API; the host runtime claims
 *    it, runs it, and reports what happens as an append-only event log.
 * 3. The client follows that log by `sequence` watermark, re-reading only what
 *    it has not applied. The watermark is persisted (core's `session` surface),
 *    so backgrounding the app or dropping the connection resumes the
 *    conversation instead of replaying it.
 *
 * Runs are `pending` -> `running` -> terminal, and the log is the only source of
 * assistant output: `assistant-delta` events build the live text, and the
 * terminal event ends the poll. A bounded number of rounds keeps a host that
 * died mid-turn from being polled forever.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  BirdCoder2ApiError,
  clearConversationWatermark,
  readConversationWatermark,
  writeConversationWatermark,
  type AgentEvent,
  type AgentSession,
  type AgentTurn,
  type BirdCoder2Ports,
  type EventLogRequest,
  type Host,
} from '@sdkwork/birdcoder2-h5-core'

/** Sessions listed per host page. */
const SESSION_PAGE_SIZE = 30

/** Turns loaded for the transcript. */
const TURN_PAGE_SIZE = 50

/** Events requested per poll round. */
const EVENT_BATCH_LIMIT = 100

/** Delay between poll rounds while a turn runs. */
const POLL_INTERVAL_MS = 1200

/**
 * Poll rounds before a running turn is treated as unreachable.
 *
 * 150 rounds at 1.2s is three minutes: long enough for a real agent turn on a
 * CPU-only host, short enough that a host which stopped reporting does not keep
 * the phone awake indefinitely.
 */
const MAX_POLL_ROUNDS = 150

/** Event kinds that end a turn. */
const TERMINAL_EVENT_KINDS: readonly AgentEvent['kind'][] = [
  'assistant-completed',
  'turn-failed',
  'turn-cancelled',
]

/** What a caller can do about a failed conversation call. */
export type ConversationFailureCode = 'authentication' | 'unknown'

export interface ConversationFailure {
  readonly code: ConversationFailureCode
  readonly message: string
}

/** Normalizes anything a port throws into a renderable failure. */
export function toConversationFailure(error: unknown): ConversationFailure {
  if (error instanceof BirdCoder2ApiError) {
    return {
      code: error.isAuthenticationFailure ? 'authentication' : 'unknown',
      message: error.traceId === undefined ? error.message : `${error.message} (trace ${error.traceId})`,
    }
  }
  return { code: 'unknown', message: error instanceof Error ? error.message : String(error) }
}

/**
 * Reads the text out of an `assistant-delta` payload.
 *
 * The payload is `unknown` by design: the event log is a host-owned stream, and
 * this reader is the single place its shape is asserted, so a payload change
 * degrades to "no incremental text" instead of a render crash.
 */
export function readDeltaText(event: AgentEvent): string {
  if (typeof event.payload !== 'object' || event.payload === null) {
    return ''
  }
  const payload = event.payload as Record<string, unknown>
  const text = payload['text'] ?? payload['delta']
  return typeof text === 'string' ? text : ''
}

export interface ConversationContextValue {
  readonly hosts: readonly Host[]
  readonly isLoadingHosts: boolean
  readonly selectedHostId: string | null
  readonly selectHost: (hostId: string) => void
  readonly sessions: readonly AgentSession[]
  readonly isLoadingSessions: boolean
  readonly activeSessionId: string | null
  readonly activeSession: AgentSession | null
  readonly turns: readonly AgentTurn[]
  readonly liveText: string
  readonly isStreaming: boolean
  readonly isLoadingTranscript: boolean
  readonly failure: ConversationFailure | null
  readonly openSession: (sessionId: string) => void
  readonly createSession: (title?: string) => Promise<AgentSession>
  readonly renameSession: (sessionId: string, title: string) => Promise<void>
  readonly deleteSession: (sessionId: string) => Promise<void>
  readonly sendTurn: (content: string) => Promise<void>
  readonly cancelActiveTurn: () => Promise<void>
  readonly reloadSessions: () => Promise<void>
}

const ConversationContext = createContext<ConversationContextValue | undefined>(undefined)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export interface ConversationProviderProps {
  readonly ports: BirdCoder2Ports
  readonly children: ReactNode
}

/**
 * Owns the fleet selection, the session list, and the live transcript.
 *
 * One provider serves both conversation screens, so opening the session list
 * and returning to the chat does not re-fetch the transcript the user was
 * reading.
 */
export function ConversationProvider({ ports, children }: ConversationProviderProps) {
  const hostsPort = ports.hosts
  const agentPort = ports.agent

  const [hosts, setHosts] = useState<readonly Host[]>([])
  const [isLoadingHosts, setIsLoadingHosts] = useState(true)
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<readonly AgentSession[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [turns, setTurns] = useState<readonly AgentTurn[]>([])
  const [liveText, setLiveText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false)
  const [failure, setFailure] = useState<ConversationFailure | null>(null)
  const [sessionReloadToken, setSessionReloadToken] = useState(0)

  /**
   * Aborts the poll loop of the turn being followed.
   *
   * A `null` argument is passed explicitly: the React 19 types require one, and
   * the fork converges on those types for every federated root.
   */
  const pollAbortRef = useRef<AbortController | null>(null)

  /** The sequence watermark of the session currently open. */
  const watermarkRef = useRef<string | null>(null)

  // The host list is the entry point: without a host there is nothing to talk to.
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    setIsLoadingHosts(true)
    hostsPort
      .listHosts({ pageSize: 50 }, controller.signal)
      .then((page) => {
        if (cancelled) {
          return
        }
        setHosts(page.items)
        setIsLoadingHosts(false)
        const first = page.items[0]
        setSelectedHostId(current => current ?? first?.hostId ?? null)
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) {
          return
        }
        setFailure(toConversationFailure(error))
        setIsLoadingHosts(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [hostsPort])

  // Sessions follow the selected host.
  useEffect(() => {
    if (selectedHostId === null) {
      setSessions([])
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setIsLoadingSessions(true)
    agentPort
      .listSessions(selectedHostId, { pageSize: SESSION_PAGE_SIZE }, controller.signal)
      .then((page) => {
        if (cancelled) {
          return
        }
        setSessions(page.items)
        setIsLoadingSessions(false)
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) {
          return
        }
        setFailure(toConversationFailure(error))
        setIsLoadingSessions(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [agentPort, selectedHostId, sessionReloadToken])

  // Switching sessions stops following the previous session's turn.
  useEffect(() => {
    pollAbortRef.current?.abort()
    pollAbortRef.current = null
    setIsStreaming(false)
    setLiveText('')
  }, [activeSessionId])

  const applyEvents = useCallback(
    (sessionId: string, incoming: readonly AgentEvent[]): boolean => {
      if (incoming.length === 0) {
        return false
      }
      let terminal = false
      let text = ''
      let lastSequence = watermarkRef.current
      for (const event of incoming) {
        lastSequence = event.sequence
        if (event.kind === 'assistant-delta') {
          text += readDeltaText(event)
        }
        if (TERMINAL_EVENT_KINDS.includes(event.kind)) {
          terminal = true
        }
      }
      if (text.length > 0) {
        setLiveText(current => current + text)
      }
      if (lastSequence !== null) {
        watermarkRef.current = lastSequence
        // Persisting after every batch is what makes a reload a resume; the
        // write is fire-and-forget because a lost watermark only costs a replay.
        void writeConversationWatermark(sessionId, lastSequence).catch(() => undefined)
      }
      return terminal
    },
    [],
  )

  const loadTranscript = useCallback(
    async (sessionId: string, signal: AbortSignal): Promise<void> => {
      const stored = await readConversationWatermark(sessionId)
      watermarkRef.current = stored ?? null
      const [turnPage, eventPage] = await Promise.all([
        agentPort.listTurns(sessionId, { pageSize: TURN_PAGE_SIZE }, signal),
        agentPort.listEvents(
          sessionId,
          stored === undefined ? { limit: EVENT_BATCH_LIMIT } : { afterSequence: stored, limit: EVENT_BATCH_LIMIT },
          signal,
        ),
      ])
      if (signal.aborted) {
        return
      }
      setTurns(turnPage.items)
      applyEvents(sessionId, eventPage.items)
    },
    [agentPort, applyEvents],
  )

  useEffect(() => {
    if (activeSessionId === null) {
      setTurns([])
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setIsLoadingTranscript(true)
    loadTranscript(activeSessionId, controller.signal)
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) {
          return
        }
        setFailure(toConversationFailure(error))
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingTranscript(false)
        }
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeSessionId, loadTranscript])

  useEffect(() => () => {
    pollAbortRef.current?.abort()
  }, [])

  const selectHost = useCallback((hostId: string) => {
    setSelectedHostId(hostId)
    setActiveSessionId(null)
  }, [])

  const openSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
  }, [])

  const reloadSessions = useCallback(async () => {
    setSessionReloadToken(token => token + 1)
  }, [])

  const createSession = useCallback(
    async (title?: string) => {
      if (selectedHostId === null) {
        throw { code: 'unknown', message: 'select a host before starting a conversation' } satisfies ConversationFailure
      }
      try {
        const session = await agentPort.createSession(selectedHostId, title)
        setSessions(current => [session, ...current])
        setActiveSessionId(session.sessionId)
        return session
      } catch (error: unknown) {
        throw toConversationFailure(error)
      }
    },
    [agentPort, selectedHostId],
  )

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      try {
        const updated = await agentPort.renameSession(sessionId, title)
        setSessions(current => current.map(session => (session.sessionId === updated.sessionId ? updated : session)))
      } catch (error: unknown) {
        throw toConversationFailure(error)
      }
    },
    [agentPort],
  )

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await agentPort.deleteSession(sessionId)
        setSessions(current => current.filter(session => session.sessionId !== sessionId))
        setActiveSessionId(current => (current === sessionId ? null : current))
        // The watermark is per conversation; leaving it behind would make a
        // later conversation that reused the id resume from a foreign point.
        await clearConversationWatermark(sessionId).catch(() => undefined)
      } catch (error: unknown) {
        throw toConversationFailure(error)
      }
    },
    [agentPort],
  )

  const sendTurn = useCallback(
    async (content: string) => {
      const sessionId = activeSessionId
      if (sessionId === null) {
        throw { code: 'unknown', message: 'open a conversation before sending' } satisfies ConversationFailure
      }
      pollAbortRef.current?.abort()
      const controller = new AbortController()
      pollAbortRef.current = controller
      setLiveText('')

      let created: AgentTurn
      try {
        created = await agentPort.createTurn(sessionId, content)
      } catch (error: unknown) {
        throw toConversationFailure(error)
      }
      setTurns(current => [...current, created])
      setIsStreaming(true)

      try {
        for (let round = 0; round < MAX_POLL_ROUNDS; round += 1) {
          const request: EventLogRequest =
            watermarkRef.current === null
              ? { limit: EVENT_BATCH_LIMIT }
              : { afterSequence: watermarkRef.current, limit: EVENT_BATCH_LIMIT }
          const page = await agentPort.listEvents(sessionId, request, controller.signal)
          if (controller.signal.aborted) {
            return
          }
          if (applyEvents(sessionId, page.items)) {
            break
          }
          await sleep(POLL_INTERVAL_MS)
          if (controller.signal.aborted) {
            return
          }
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setFailure(toConversationFailure(error))
        }
      } finally {
        if (pollAbortRef.current === controller) {
          pollAbortRef.current = null
          setIsStreaming(false)
          // The durable turn record now carries the assistant reply, so the
          // transcript replaces the incrementally assembled text.
          const refreshed = await agentPort
            .listTurns(sessionId, { pageSize: TURN_PAGE_SIZE })
            .catch(() => undefined)
          if (refreshed !== undefined) {
            setTurns(refreshed.items)
          }
        }
      }
    },
    [activeSessionId, agentPort, applyEvents],
  )

  const cancelActiveTurn = useCallback(async () => {
    const sessionId = activeSessionId
    const running = [...turns].reverse().find(turn => turn.status === 'running' || turn.status === 'pending')
    if (sessionId === null || running === undefined) {
      return
    }
    try {
      const cancelled = await agentPort.cancelTurn(sessionId, running.turnId)
      setTurns(current => current.map(turn => (turn.turnId === cancelled.turnId ? cancelled : turn)))
    } catch (error: unknown) {
      throw toConversationFailure(error)
    }
  }, [activeSessionId, agentPort, turns])

  const activeSession = useMemo(
    () => sessions.find(session => session.sessionId === activeSessionId) ?? null,
    [sessions, activeSessionId],
  )

  const value = useMemo<ConversationContextValue>(
    () => ({
      hosts,
      isLoadingHosts,
      selectedHostId,
      selectHost,
      sessions,
      isLoadingSessions,
      activeSessionId,
      activeSession,
      turns,
      liveText,
      isStreaming,
      isLoadingTranscript,
      failure,
      openSession,
      createSession,
      renameSession,
      deleteSession,
      sendTurn,
      cancelActiveTurn,
      reloadSessions,
    }),
    [
      hosts,
      isLoadingHosts,
      selectedHostId,
      selectHost,
      sessions,
      isLoadingSessions,
      activeSessionId,
      activeSession,
      turns,
      liveText,
      isStreaming,
      isLoadingTranscript,
      failure,
      openSession,
      createSession,
      renameSession,
      deleteSession,
      sendTurn,
      cancelActiveTurn,
      reloadSessions,
    ],
  )

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>
}

/** Reads the conversation state; must be called under {@link ConversationProvider}. */
export function useConversation(): ConversationContextValue {
  const value = useContext(ConversationContext)
  if (value === undefined) {
    throw new Error('useConversation requires <ConversationProvider>; the shell must mount it around conversation screens')
  }
  return value
}
