/** The VSCode-style explorer surface: tab strip over file, diff, and web tab bodies. */

import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
} from 'react'
import { LinkIcon, classifyLinkPath } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { DiffTabView } from './DiffTabView.tsx'
import { FileView } from './FileView.tsx'
import { normalizeNewTabUrl } from './newTabUrl.ts'
import type { SdkworkExplorerService } from './service.ts'
import type { ExplorerTab } from './tabs.ts'
import { WebView } from './WebView.tsx'
import css from './ExplorerPanel.module.css'

/** Inject face the explorer registration contributes to its Sidebar tab body. */
export interface ExplorerPanelInjected {
  /** Explorer controller (tab store + file/web capabilities). */
  controller: SdkworkExplorerService
  /** Collapse the right-Sidebar column (the shell-owned rail/panel track). */
  closePanel: () => void
}

/** Full props of the explorer panel component. */
export type ExplorerPanelProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & ExplorerPanelInjected
  & PropsLocale<'explorer'>

function TabIcon({ tab }: { tab: ExplorerTab }) {
  if (tab.kind === 'web') return <LinkIcon kind="url" className={css.tabIcon} />
  return <LinkIcon kind={classifyLinkPath(tab.path ?? '')} className={css.tabIcon} />
}

/**
 * Render the explorer panel: a horizontal tab strip (file and web tabs share
 * it) over the active tab's body. It is the body of the `sdkwork-explorer`
 * right-Sidebar tab type and fills whatever the Sidebar gives — width, drag-
 * resize, and open/close belong to the shell.
 *
 * Tab bodies follow VSCode's editor-group model: once a tab has been
 * activated its body stays mounted (hidden while inactive), so a Monaco
 * editor's cursor, undo history, unsaved source edits, and scroll position
 * survive a switch and no file is re-read on the way back. Monaco's
 * automatic layout re-measures on the reveal, and the read-only viewer tabs
 * idle cheaply.
 *
 * The strip itself adapts to the shell: on the Electron frameless desktop the
 * floating window-controls cluster owns the top-right corner, so the strip
 * reserves its platform inset (`--dsh-window-controls-details-right`, set by
 * the window-controls plugin) and offers its empty areas as drag region; on
 * the web both are inert. A `+` opens a web tab by URL, and scroll arrows
 * appear whenever the tabs overflow the strip's width.
 */
export function ExplorerPanel({ controller, closePanel, t }: ExplorerPanelProps) {
  const snapshot = useSyncExternalStore(controller.tabs.subscribe, controller.tabs.getSnapshot)
  // Hooks stay above the empty-strip early return: the panel unmounts on the
  // last close, but a transient zero-tab render must not change the hook count.
  const visited = useRef<Set<string>>(new Set()).current
  const stripRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const [newTabOpen, setNewTabOpen] = useState(false)
  const [newTabUrl, setNewTabUrl] = useState('')

  const measure = useCallback(() => {
    const el = stripRef.current
    if (el === null) return
    const max = el.scrollWidth - el.clientWidth
    setOverflow({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 })
  }, [])

  // Overflow state tracks tabs, viewport, and Sidebar-column resizes.
  useEffect(() => {
    measure()
    const el = stripRef.current
    if (el === null) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [measure, snapshot.tabs.length])

  // Activation (pick, reopen, +/- creation) keeps its tab in view.
  const activeId = (snapshot.tabs.find(tab => tab.id === snapshot.activeId) ?? snapshot.tabs.at(0))?.id
  useEffect(() => {
    const el = stripRef.current
    if (el === null || activeId === undefined) return
    el.querySelector(`[data-tab-id="${activeId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  if (snapshot.tabs.length === 0) return null
  const active = snapshot.tabs.find(tab => tab.id === snapshot.activeId) ?? snapshot.tabs[0]
  visited.add(active.id)

  const scrollStrip = (direction: -1 | 1): void => {
    stripRef.current?.scrollBy({ left: direction * 240, behavior: 'smooth' })
  }

  const submitNewTab = (): void => {
    const url = normalizeNewTabUrl(newTabUrl)
    if (url === undefined) return
    controller.openUrl(url)
    setNewTabUrl('')
    setNewTabOpen(false)
  }

  return (
    <div className={css.root} aria-label={t('panel.aria')}>
      <div className={css.stripRoot}>
        {overflow.left && (
          <button
            type="button"
            className={css.stripNav}
            aria-label={t('tab.scrollLeft')}
            title={t('tab.scrollLeft')}
            onClick={() => { scrollStrip(-1) }}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
              <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <div className={css.strip} role="tablist" ref={stripRef} onScroll={measure}>
          {snapshot.tabs.map((tab) => {
            const isActive = tab.id === active.id
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                className={css.tab}
                data-tab-id={tab.id}
                data-active={isActive || undefined}
                onClick={() => { controller.tabs.activate(tab.id) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    controller.tabs.activate(tab.id)
                  }
                }}
              >
                <TabIcon tab={tab} />
                <span className={css.tabTitle} title={tab.kind === 'web' ? tab.url : tab.path}>
                  {tab.title}
                </span>
                <button
                  type="button"
                  className={css.tabClose}
                  aria-label={`${t('tab.close')} ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    controller.closeTab(tab.id)
                  }}
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
        {overflow.right && (
          <button
            type="button"
            className={css.stripNav}
            aria-label={t('tab.scrollRight')}
            title={t('tab.scrollRight')}
            onClick={() => { scrollStrip(1) }}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <div className={css.newTabWrap}>
          <button
            type="button"
            className={css.newTabButton}
            aria-label={t('tab.new')}
            title={t('tab.new')}
            onClick={() => { setNewTabOpen(value => !value) }}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {newTabOpen && (
            <>
              <div className={css.menuBackdrop} onClick={() => { setNewTabOpen(false) }} />
              <div className={css.newTabMenu}>
                <input
                  autoFocus
                  className={css.newTabInput}
                  placeholder={t('tab.newPlaceholder')}
                  aria-label={t('tab.new')}
                  value={newTabUrl}
                  spellCheck={false}
                  onChange={(event) => { setNewTabUrl(event.target.value) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setNewTabOpen(false)
                    if (event.key === 'Enter') submitNewTab()
                  }}
                />
                <button type="button" className={css.newTabOpen} onClick={submitNewTab}>
                  {t('tab.newOpen')}
                </button>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          className={css.panelClose}
          aria-label={t('panel.aria')}
          title={t('panel.aria')}
          onClick={closePanel}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className={css.body}>
        {snapshot.tabs.map((tab) => {
          if (!visited.has(tab.id)) return null
          const isActive = tab.id === active.id
          const body =
            (tab.kind === 'file' || tab.kind === 'source') && tab.path !== undefined ? (
              <FileView
                path={tab.path}
                cwd={tab.cwd}
                reader={controller.files}
                openNative={controller.openNativeFile}
                onOpenSource={() => { controller.openFileSource(tab.path ?? '', tab.cwd) }}
                onSave={(filePath, fileContent) => controller.saveFile(filePath, fileContent)}
                sourceMode={tab.kind === 'source'}
                t={t}
              />
            ) : tab.kind === 'diff' && tab.path !== undefined && tab.hunks !== undefined ? (
              <DiffTabView
                path={tab.path}
                hunks={tab.hunks}
                t={t}
                onOpenSource={() => { controller.openFileSource(tab.path ?? '', tab.cwd) }}
              />
            ) : tab.kind === 'web' && tab.url !== undefined ? (
              <WebView url={tab.url} t={t} />
            ) : null
          if (body === null) return null
          return (
            <div key={tab.id} className={css.tabBody} hidden={!isActive || undefined}>
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}
