/**
 * Host-facing session facts shared by the two independent template dialogs.
 *
 * This hook only constructs the deploy clients and reads the current IAM
 * account, then refreshes both when the host notifies (gateway switch, IAM
 * hydration/token rotation). It carries no publish or install workflow state;
 * each flow composes its own dialog on top.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import type { TemplateDialogUser } from './TemplateDialogFrame.tsx'

/** Reactive theme face the dialogs consume. */
export interface TemplateFlowTheme {
  getColorScheme(): 'light' | 'dark'
  subscribe(listener: () => void): () => void
}

/** Current host session facts plus the change notifier. */
export interface TemplateHostSession {
  readonly clients: DeployHostClients | undefined
  readonly currentUser: TemplateDialogUser | undefined
  readonly colorScheme: 'light' | 'dark'
  readonly refreshHost: () => void
}

/**
 * Bind one host adapter and theme port to React.
 * @param host - the host adapter.
 * @param theme - the reactive color-scheme port.
 * @returns the current clients/account/scheme and a host-change notifier.
 */
export function useTemplateHostSession(
  host: DeployHost,
  theme: TemplateFlowTheme,
): TemplateHostSession {
  const [clients, setClients] = useState<DeployHostClients | undefined>(() => {
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  })
  const [currentUser, setCurrentUser] = useState<TemplateDialogUser | undefined>(() => host.readCurrentUser())
  const subscribeTheme = useCallback((listener: () => void) => theme.subscribe(listener), [theme])
  const readTheme = useCallback(() => theme.getColorScheme(), [theme])
  const colorScheme = useSyncExternalStore(subscribeTheme, readTheme, readTheme)

  useEffect(() => {
    return host.subscribe(() => {
      try {
        setClients(host.readClients())
      } catch {
        setClients(undefined)
      }
      setCurrentUser(host.readCurrentUser())
    })
  }, [host])

  const refreshHost = useCallback(() => { host.notifyChange() }, [host])
  return { clients, currentUser, colorScheme, refreshHost }
}
