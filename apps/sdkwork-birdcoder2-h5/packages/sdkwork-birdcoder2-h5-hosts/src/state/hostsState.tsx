/**
 * Host fleet state.
 *
 * One provider owns the fleet list for every host screen, so switching between
 * the list and the enrollment form does not re-fetch, and a revoke updates both
 * without a round trip through the router.
 *
 * The provider is handed {@link BirdCoder2Ports} instead of constructing a
 * client: the composition root decides the transport, and this package stays
 * free of the generated SDK (`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`
 * section 9).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  BirdCoder2ApiError,
  type BirdCoder2Ports,
  type Host,
  type HostEnrollment,
  type HostEnrollmentCreateInput,
} from '@sdkwork/birdcoder2-h5-core'

/** Page size a mobile fleet list asks for; the fleet is small by construction. */
const HOST_PAGE_SIZE = 50

/** What a caller can do about a failed host call. */
export type HostsFailureCode = 'authentication' | 'unknown'

/** A normalized failure a screen can render and act on. */
export interface HostsFailure {
  readonly code: HostsFailureCode
  readonly message: string
}

/**
 * Normalizes anything a port throws.
 *
 * The distinction that matters on a phone is "sign in again" versus "try
 * again", so the platform status is collapsed into a code here rather than in
 * every screen.
 */
export function toHostsFailure(error: unknown): HostsFailure {
  if (error instanceof BirdCoder2ApiError) {
    return {
      code: error.isAuthenticationFailure ? 'authentication' : 'unknown',
      message: error.traceId === undefined ? error.message : `${error.message} (trace ${error.traceId})`,
    }
  }
  return { code: 'unknown', message: error instanceof Error ? error.message : String(error) }
}

export interface HostsContextValue {
  readonly hosts: readonly Host[]
  readonly isLoading: boolean
  readonly failure: HostsFailure | null
  /** Re-reads the fleet. */
  readonly refresh: () => Promise<void>
  /** Renames a host; throws a normalized failure the caller renders. */
  readonly renameHost: (hostId: string, displayName: string) => Promise<void>
  /** Removes a host from the fleet; throws a normalized failure the caller renders. */
  readonly revokeHost: (hostId: string) => Promise<void>
  /** Issues a pairing code; throws a normalized failure the caller renders. */
  readonly issueEnrollment: (input: HostEnrollmentCreateInput) => Promise<HostEnrollment>
}

const HostsContext = createContext<HostsContextValue | undefined>(undefined)

export interface HostsProviderProps {
  readonly ports: BirdCoder2Ports
  readonly children: ReactNode
}

/**
 * Loads the fleet once, then keeps it in step with local mutations.
 *
 * A reload aborts the in-flight read, so a phone that backgrounds and resumes
 * cannot apply a stale page on top of a newer one.
 */
export function HostsProvider({ ports, children }: HostsProviderProps) {
  const hostsPort = ports.hosts
  const [hosts, setHosts] = useState<readonly Host[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [failure, setFailure] = useState<HostsFailure | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    setIsLoading(true)
    setFailure(null)
    hostsPort
      .listHosts({ pageSize: HOST_PAGE_SIZE }, controller.signal)
      .then((page) => {
        if (cancelled) {
          return
        }
        setHosts(page.items)
        setIsLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) {
          return
        }
        setFailure(toHostsFailure(error))
        setIsLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [hostsPort, reloadToken])

  const refresh = useCallback(async () => {
    setReloadToken(token => token + 1)
  }, [])

  const renameHost = useCallback(
    async (hostId: string, displayName: string) => {
      try {
        const updated = await hostsPort.updateHost(hostId, { displayName })
        setHosts(current => current.map(host => (host.hostId === updated.hostId ? updated : host)))
      } catch (error: unknown) {
        throw toHostsFailure(error)
      }
    },
    [hostsPort],
  )

  const revokeHost = useCallback(
    async (hostId: string) => {
      try {
        await hostsPort.deleteHost(hostId)
        setHosts(current => current.filter(host => host.hostId !== hostId))
      } catch (error: unknown) {
        throw toHostsFailure(error)
      }
    },
    [hostsPort],
  )

  const issueEnrollment = useCallback(
    async (input: HostEnrollmentCreateInput) => {
      try {
        return await hostsPort.createHostEnrollment(input)
      } catch (error: unknown) {
        throw toHostsFailure(error)
      }
    },
    [hostsPort],
  )

  const value = useMemo<HostsContextValue>(
    () => ({ hosts, isLoading, failure, refresh, renameHost, revokeHost, issueEnrollment }),
    [hosts, isLoading, failure, refresh, renameHost, revokeHost, issueEnrollment],
  )

  return <HostsContext.Provider value={value}>{children}</HostsContext.Provider>
}

/** Reads the fleet state; must be called under {@link HostsProvider}. */
export function useHosts(): HostsContextValue {
  const value = useContext(HostsContext)
  if (value === undefined) {
    throw new Error('useHosts requires <HostsProvider>; the shell must mount it around host screens')
  }
  return value
}
