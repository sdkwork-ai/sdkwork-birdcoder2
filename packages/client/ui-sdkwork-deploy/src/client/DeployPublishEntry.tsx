/**
 * Standalone 发布应用 entry: pick one canonical app source (or a custom
 * directory with an explicit type), then run the existing publish flow.
 */
import { useState } from 'react'
import type { DeployLocaleFace, DeployPublishThemePort } from './deployPorts.ts'
import type { DeployHost } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import { DeployAppPicker } from './DeployAppPicker.tsx'
import { DeployProjectAppFlow, type ProjectAppFlowOutcome } from './DeployProjectAppFlow.tsx'

/** Props for the standalone publish entry. */
export interface DeployPublishEntryProps {
  readonly host: DeployHost
  readonly theme: DeployPublishThemePort
  readonly locale: DeployLocaleFace
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly directory?: string | undefined
  readonly onDone?: ((outcome: ProjectAppFlowOutcome) => void) | undefined
  readonly onClose: () => void
}

interface Selection {
  readonly directory: string
  readonly cardId?: string
}

/**
 * Render the picker first, then the publish flow for the chosen source.
 * @param props - host, theme/locale seats, project directory, and close.
 * @returns the active picker or publish dialog.
 */
export function DeployPublishEntry({
  host, theme, locale, t, directory, onDone, onClose,
}: DeployPublishEntryProps) {
  const [selection, setSelection] = useState<Selection>()
  return (
    <DeployAppPicker
      host={host}
      theme={theme}
      locale={locale}
      t={t}
      directory={directory}
      onSelect={(nextDirectory, cardId) => {
        setSelection({ directory: nextDirectory, ...(cardId === undefined ? {} : { cardId }) })
      }}
      onClose={onClose}
    >
      {selection === undefined
        ? undefined
        : (
          <DeployProjectAppFlow
            host={host}
            theme={theme}
            locale={locale}
            t={t}
            directory={selection.directory}
            embedded
            skipTypeStep
            onBackToSource={() => { setSelection(undefined) }}
            {...(selection.cardId === undefined ? {} : { cardIdOverride: selection.cardId })}
            onDone={onDone}
            onClose={onClose}
          />
        )}
    </DeployAppPicker>
  )
}
