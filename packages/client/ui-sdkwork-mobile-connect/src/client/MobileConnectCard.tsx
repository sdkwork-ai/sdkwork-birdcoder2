/**
 * The mobile-connection scan card: the two destinations (mobile App and WeChat
 * mini program), the QR code of the selected one, and the durable
 * allow-remote-connection switch. One body renders in both hosts — the rail
 * shortcut's hover card and the dialog its click opens — so the two surfaces
 * can never drift.
 *
 * The QR always sits on its own light plate rather than the card material: a
 * scan symbol needs a light field with dark modules in either theme, so the
 * plate paints from the artifact pair the encoder paints with, not from a theme
 * alias that flips with the palette.
 */
import { useId, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { SegmentedTabs, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { MobileConnectSettings } from '../settings.ts'
import css from './MobileConnectCard.module.css'

/** The two scan destinations the card switches between. */
type ConnectTab = 'app' | 'miniProgram'

/** Edge length of the QR symbol inside its plate, in CSS pixels. */
const QR_SIZE = 176

/** Brand mark drawn in the symbol's centre; error correction stays at H so the excavated hole is recoverable. */
const QR_LOGO = { src: '/favicon.png', width: 40, height: 40, excavate: true }

/**
 * Symbol colours, held as the scan artifact's own pair rather than a theme
 * alias: a readable symbol keeps near-black modules on white in either
 * palette. The plate below the symbol paints from the same pair.
 */
const QR_FOREGROUND = '#0f1115'
const QR_BACKGROUND = '#ffffff'

/** The plate's half of that pair, handed to the stylesheet as local properties. */
const PLATE_STYLE = {
  '--mc-plate-field': QR_BACKGROUND,
  '--mc-plate-ink': QR_FOREGROUND,
} as CSSProperties

/** Props of one scan card: the live settings section, the preference write, and the locale seat. */
export type MobileConnectCardProps = PropsLocale<'mobileConnect'> & {
  /** The live settings section this card mirrors; `undefined` value until the scope accepts one. */
  snapshot: ConfigFormSnapshot<MobileConnectSettings>
  /**
   * Persist the remote-connection preference.
   * @param value - the state the switch asks for.
   * @returns whether the Host accepted the write.
   */
  setRemoteAccess: (value: boolean) => Promise<boolean>
  /** Which host renders the body: the rail's hover card (`compact`) or the dialog. */
  variant: 'compact' | 'dialog'
}

/**
 * Render the scan card.
 * @param props - the settings section, the preference write, the host variant, and the locale seat.
 * @returns the card body.
 */
export function MobileConnectCard({ snapshot, setRemoteAccess, variant, t }: MobileConnectCardProps): ReactNode {
  const [tab, setTab] = useState<ConnectTab>('app')
  const [saveFailed, setSaveFailed] = useState(false)
  const id = useId()
  const { status, value, writable } = snapshot
  const ready = status === 'ready' && value !== undefined
  const address = (tab === 'app' ? value?.appDownloadUrl : value?.miniProgramUrl)?.trim() ?? ''
  const codeLabel = t(tab === 'app' ? 'qr.app' : 'qr.miniProgram')
  const panelId = `${id}-panel`

  const write = (next: boolean): void => {
    setSaveFailed(false)
    void setRemoteAccess(next).then((accepted) => { if (!accepted) setSaveFailed(true) })
  }

  return (
    <div className={variant === 'compact' ? `${css.card} ${css.compact}` : `${css.card} ${css.dialog}`}>
      <SegmentedTabs
        size="sm"
        className={css.tabs}
        label={t('tabs.label')}
        value={tab}
        onChange={setTab}
        items={[
          { value: 'app', label: t('tab.app'), id: `${id}-app`, panelId },
          { value: 'miniProgram', label: t('tab.miniProgram'), id: `${id}-mini`, panelId },
        ]}
      />
      <div className={css.panel} id={panelId} role="tabpanel" aria-labelledby={tab === 'app' ? `${id}-app` : `${id}-mini`}>
        <p className={css.title}>{t(tab === 'app' ? 'title.app' : 'title.miniProgram')}</p>
        <div className={css.codePlate} style={PLATE_STYLE}>
          {status === 'loading'
            ? <span className={css.spinner} role="status" aria-label={t('qr.loading')} />
            : address === ''
              ? <p className={css.unconfigured}>{t('qr.unconfigured')}</p>
              : (
                <QRCodeSVG
                  className={css.code}
                  value={address}
                  size={QR_SIZE}
                  level="H"
                  marginSize={0}
                  bgColor={QR_BACKGROUND}
                  fgColor={QR_FOREGROUND}
                  imageSettings={QR_LOGO}
                  role="img"
                  aria-label={codeLabel}
                  title={codeLabel}
                />
              )}
        </div>
        {status !== 'loading' && address === '' && <p className={css.hint}>{t('qr.unconfiguredHint')}</p>}
      </div>
      <span className={css.divider} aria-hidden="true" />
      <div className={css.remoteRow}>
        <span className={css.remoteLabel}>{t('remote')}</span>
        <Switch
          checked={value?.remoteAccessEnabled === true}
          disabled={!ready || !writable}
          label={t('remote')}
          title={ready && !writable ? t('remote.readOnly') : undefined}
          className={css.switch}
          onChange={write}
        />
      </div>
      {saveFailed && <p className={css.failure} role="status">{t('remote.failed')}</p>}
    </div>
  )
}
