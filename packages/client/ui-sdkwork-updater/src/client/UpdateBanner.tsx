/**
 * The update banner: a non-intrusive card on the frame's floating layer
 * (`shell.overlay`) that follows the main-process update state machine — an
 * offer with release notes, a download progress view, and the restart prompt.
 * Pure presentation over the preload's `updates` surface; absent the bridge
 * (web composition, fixture mode) the banner renders nothing.
 */
import type { ReactNode } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the shell.overlay slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createUpdateBannerStore } from './update-banner-store.ts'
import css from './UpdateBanner.module.css'

/** Injected business face: the preload's update actions. */
export interface UpdateBannerInjected {
  /** Start downloading the offered update. */
  download: () => void
  /** Quit and run the downloaded installer. */
  install: () => void
  /** Open the release page in the default browser (unsigned Phase A fallback). */
  openReleasePage: () => void
  /** Dismiss the current offer until a different version arrives. */
  dismiss: () => void
}

/** Full component props: root runtime share + store share + injected face. */
export type UpdateBannerProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createUpdateBannerStore>>
  & UpdateBannerInjected

/**
 * Render the update banner for the offer/download/ready phases; every other
 * phase (idle, checking, disabled, installing) and a dismissed offer render
 * nothing. Download progress and the ready-to-install action cannot be hidden.
 * @param props - composed slot props.
 * @returns the banner card, or nothing while there is nothing to show.
 */
export function UpdateBanner({ download, install, openReleasePage, dismiss, useStore }: UpdateBannerProps): ReactNode {
  const state = useStore(s => s)
  const { phase, canInstall, version, releaseNotes, progressPercent, error, dismissedVersion } = state
  if (phase === 'available' && dismissedVersion !== undefined && dismissedVersion === version) return null
  if (phase !== 'available' && phase !== 'downloading' && phase !== 'downloaded') return null
  const title = phase === 'downloading'
    ? `正在下载 v${version}…`
    : phase === 'downloaded'
      ? `v${version} 已就绪，重启后安装`
      : `发现新版本 v${version}`
  return (
    <div className={css.banner} role="status">
      <div className={css.head}>
        <div className={css.title}>{title}</div>
        {phase === 'available' && (
          <button type="button" className={css.dismiss} aria-label="稍后再说" onClick={dismiss}>×</button>
        )}
      </div>
      {phase === 'downloading' && (
        <div
          className={css.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent ?? 0}
        >
          <div className={css.progressFill} style={{ width: `${progressPercent ?? 0}%` }} />
          <span className={css.progressLabel}>{progressPercent ?? 0}%</span>
        </div>
      )}
      {releaseNotes !== undefined && (
        <details className={css.notes}>
          <summary>更新内容</summary>
          <MarkdownText text={releaseNotes} />
        </details>
      )}
      {error !== undefined && <div className={css.error}>{error}</div>}
      <div className={css.actions}>
        {phase === 'available' && canInstall && <button type="button" className={css.primary} onClick={download}>下载更新</button>}
        {phase === 'downloaded' && canInstall && <button type="button" className={css.primary} onClick={install}>重启并安装</button>}
        <button type="button" className={css.ghost} onClick={openReleasePage}>查看发布页</button>
      </div>
    </div>
  )
}
