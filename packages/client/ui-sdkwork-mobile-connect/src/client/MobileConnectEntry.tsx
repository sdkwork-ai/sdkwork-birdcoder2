/**
 * The mobile-connection rail shortcut: one icon cell in the rail's
 * `mode.rail.panel` seat, directly above the message center. Hovering the cell
 * shows the scan card; activating it opens the same body as a dialog, so the
 * destinations and the remote-connection switch stay reachable without a
 * pointer hover. The cell owns no selection state — it opens no center panel.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { HoverCard, IconRemoteConnectionOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail's panel-shortcut seat declaration (mode.rail.panel).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type { MobileConnectSettings } from '../settings.ts'
import { MobileConnectCard } from './MobileConnectCard.tsx'
import css from './MobileConnectEntry.module.css'

/** Injected business face: the live settings section and the preference write. */
export interface MobileConnectEntryInjected {
  hooks: {
    /** The mobile-connection settings section the card mirrors. */
    config: HostObservable<ConfigFormSnapshot<MobileConnectSettings>>
  }
  /**
   * Persist the remote-connection preference.
   * @param value - the state the switch asks for.
   * @returns whether the Host accepted the write.
   */
  setRemoteAccess: (value: boolean) => Promise<boolean>
}

/** Full component props: owner share + injected face + locale seat. */
export type MobileConnectEntryProps =
  PropsRuntime<'mode.rail.panel'>
  & InjectFace<MobileConnectEntryInjected>
  & PropsLocale<'mobileConnect'>

/**
 * Render the mobile-connection rail shortcut with its hover card and dialog.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the rail cell, its hover card, and the dialog it opens.
 */
export function MobileConnectEntry({ useConfig, setRemoteAccess, t }: MobileConnectEntryProps): ReactNode {
  const config = useConfig(snapshot => snapshot)
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <>
      <HoverCard
        // Long enough that sweeping the rail does not strobe the card, short
        // enough that resting on the cell reads as immediate.
        openDelayMs={140}
        anchor={(
          <button
            type="button"
            className={css.entry}
            aria-label={t('rail.aria')}
            aria-haspopup="dialog"
            onClick={() => { setDialogOpen(true) }}
          >
            <IconRemoteConnectionOutlineRegular size={22} />
          </button>
        )}
        content={(
          <MobileConnectCard
            snapshot={config}
            setRemoteAccess={setRemoteAccess}
            variant="compact"
            t={t}
          />
        )}
      />
      <Modal
        open={dialogOpen}
        onClose={() => { setDialogOpen(false) }}
        title={t('dialog.title')}
        closeLabel={t('dialog.close')}
      >
        <MobileConnectCard
          snapshot={config}
          setRemoteAccess={setRemoteAccess}
          variant="dialog"
          t={t}
        />
      </Modal>
    </>
  )
}
