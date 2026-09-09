/** Embedded web body of one explorer web tab: Electron webview or sandboxed iframe. */

import { Fragment, createElement, useState, type CSSProperties } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WebView.module.css'

/** Desktop shell detection — the same single-point probe the connection package uses. */
function isDesktopShell(): boolean {
  return typeof window !== 'undefined'
    && (window as { desktopBridge?: unknown }).desktopBridge !== undefined
}

export interface WebViewProps {
  /** Absolute http(s) URL to render. */
  url: string
  /** Namespace-bound translate (the framework-injected seat). */
  t: TranslateNS<'explorer'>
}

const FILL_STYLE: CSSProperties = { width: '100%', height: '100%', border: 'none', display: 'block' }

/**
 * Render one web tab body. On the Electron desktop shell this is a
 * `<webview>` (separate renderer process, immune to X-Frame-Options); on the
 * web it degrades to a sandboxed iframe (the MobileSimulator pattern) with a
 * visible escape hatch, because many sites refuse framing.
 */
export function WebView({ url, t }: WebViewProps) {
  const [reloadKey, setReloadKey] = useState(0)
  const desktop = isDesktopShell()

  const body = desktop ? (
    createElement(
      'webview',
      {
        key: reloadKey,
        src: url,
        // In-memory partition: explorer pages keep their own session state
        // without touching the app shell's cookies.
        partition: 'sdkwork-explorer',
        allowpopups: 'true',
        style: FILL_STYLE,
      },
    )
  ) : (
    <iframe
      key={reloadKey}
      className={css.frame}
      src={url}
      title={url}
      style={FILL_STYLE}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
      referrerPolicy="no-referrer"
      allow="fullscreen"
    />
  )

  return (
    <div className={css.root}>
      <div className={css.toolbar}>
        <input
          className={css.address}
          type="text"
          value={url}
          readOnly
          aria-label={t('web.addressAria')}
          spellCheck={false}
        />
        <button
          type="button"
          className={css.tool}
          title={t('web.reload')}
          aria-label={t('web.reload')}
          onClick={() => { setReloadKey(key => key + 1) }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={css.tool}
          title={t('web.openExternal')}
          aria-label={t('web.openExternal')}
          onClick={() => { window.open(url, '_blank', 'noopener,noreferrer') }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path
              d="M6.5 3.5H3.5v9h9v-3M9 2.5h4.5V7M13.2 2.8 7.8 8.2"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {!desktop && (
        <div className={css.hint}>
          <Fragment key="hint">{t('web.hint')}</Fragment>
        </div>
      )}
      <div className={css.body}>
        {body}
      </div>
    </div>
  )
}
