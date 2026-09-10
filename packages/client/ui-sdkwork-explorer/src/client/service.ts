/** Explorer controller: tab ledger, Sidebar reveal, native fallbacks, and the ask-chooser. */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ExplorerOpenDiffDetail } from './bus.ts'
import type { ExplorerOpenMode } from '../explorer-settings.ts'
import { OpenChooser } from './OpenChooser.tsx'
import type { FileReader } from './FileView.tsx'
import { TabStore, tabTitle } from './tabs.ts'

/** Pending gesture behind an open chooser bubble. */
interface PendingGesture {
  subject: 'file' | 'link'
  path?: string
  url?: string
  cwd?: string
}

/** Host capabilities the apply world injects (cordis services and the right-Sidebar face). */
export interface ExplorerHostDeps {
  /** Namespace-bound translate for the chooser bubble. */
  t: TranslateNS<'explorer'>
  /**
   * Open the explorer's right-Sidebar tab by kind, revealing and focusing the
   * column (the store's open expands a collapsed column in the same step).
   */
  openExplorerTab(): void
  /** Governed text-file reader (uiWorkspace-backed; may reject). */
  readTextFile(path: string, signal?: AbortSignal): Promise<string>
  /** Governed text-file writer behind the 1 MB fence (the source view's save; may reject). */
  writeTextFile(path: string, content: string): Promise<void>
  /** Hand one workspace path to the operating system (openWorkspacePath RPC). */
  openNativeFile(path: string): Promise<void>
  /** Open one URL outside the app (system browser). */
  openExternalUrl(url: string): void
  /** Persist one chooser "always use this" choice into the settings scope. */
  setOpenMode(subject: 'file' | 'link', mode: ExplorerOpenMode): void
}

/**
 * The service this plugin provides as `sdkworkExplorer`. Sibling surfaces can
 * open explorer tabs directly without the DOM gesture bus; the panel reads
 * its tab ledger and file capabilities from the same instance.
 */
export class SdkworkExplorerService {
  /** Reactive tab ledger backing the VSCode-style strip. */
  readonly tabs = new TabStore()

  /** Governed text-file reader face consumed by file tab bodies. */
  readonly files: FileReader

  constructor(private readonly deps: ExplorerHostDeps) {
    this.files = { readTextFile: (path, signal) => deps.readTextFile(path, signal) }
  }

  /** Open (or activate) one file tab and surface the right-hand column. */
  openFile(path: string, cwd?: string): void {
    this.surface()
    this.tabs.open({ kind: 'file', path, cwd, title: tabTitle({ kind: 'file', path }) })
  }

  /**
   * Open (or activate) one file's editable source tab and surface the
   * right-hand column. A diff/patch file's change view offers this through
   * its header button: the change view stays read-only, the source tab is
   * the editable face of the same file.
   */
  openFileSource(path: string, cwd?: string): void {
    const base = tabTitle({ kind: 'source', path })
    this.surface()
    this.tabs.open({ kind: 'source', path, cwd, title: `${base} · ${this.deps.t('tab.source')}` })
  }

  /**
   * Open (or refresh) one applied-change diff tab and surface the right-hand
   * column. The preview is inherently a built-in surface — the operating
   * system has no patch viewer to hand the change to — so this bypasses the
   * open-mode policy: an edit/write row's file link lands on the diff preview
   * by default, and the tab's header offers the editable source view.
   */
  openFileDiff(detail: ExplorerOpenDiffDetail): void {
    const base = tabTitle({ kind: 'diff', path: detail.path })
    this.surface()
    this.tabs.open({
      kind: 'diff',
      path: detail.path,
      cwd: detail.cwd,
      hunks: detail.hunks,
      title: `${base} · ${this.deps.t('tab.diff')}`,
    })
  }

  /**
   * Save one source tab's content through the governed writer.
   * @param path - the file's absolute path.
   * @param content - the editor's full text.
   * @returns resolves when the write landed; rejects with the wire failure.
   */
  async saveFile(path: string, content: string): Promise<void> {
    await this.deps.writeTextFile(path, content)
  }

  /** Open (or activate) one web tab and surface the right-hand column. */
  openUrl(url: string): void {
    this.surface()
    this.tabs.open({ kind: 'web', url, title: tabTitle({ kind: 'web', url }) })
  }

  /** Close one tab; the explorer page tab itself stays in the Sidebar strip. */
  closeTab(id: string): void {
    this.tabs.close(id)
  }

  /** Close every tab; the explorer page tab itself stays in the Sidebar strip. */
  closeAll(): void {
    for (const tab of [...this.tabs.getSnapshot().tabs]) this.tabs.close(tab.id)
  }

  /** Open one path with the operating system's default application. */
  openNativeFile = (path: string): void => {
    this.deps.openNativeFile(path).catch(() => {
      // The chooser/file card already surfaces failures through state; the
      // native fallback is best-effort by contract.
    })
  }

  /** Show the ask-every-time chooser for one pending gesture. */
  showChooser(gesture: PendingGesture, x: number | undefined, y: number | undefined): void {
    this.closeChooser()
    const container = document.createElement('div')
    document.body.appendChild(container)
    this.chooserContainer = container
    this.chooserRoot = createRoot(container)
    this.pendingGesture = gesture
    this.chooserRoot.render(createElement(OpenChooser, {
      title: this.deps.t(gesture.subject === 'file' ? 'chooser.title.file' : 'chooser.title.link'),
      x: x ?? Math.max(window.innerWidth / 2 - 150, 12),
      y: y ?? Math.max(window.innerHeight / 2 - 85, 12),
      t: this.deps.t,
      onPick: (mode: ExplorerOpenMode, remember: boolean) => {
        this.closeChooser()
        if (remember) this.deps.setOpenMode(gesture.subject, mode)
        this.applyChooserChoice(gesture, mode)
      },
      onClose: () => { this.closeChooser() },
    }))
  }

  /** Tear down the chooser bubble and its React root. */
  closeChooser(): void {
    this.pendingGesture = undefined
    this.chooserRoot?.unmount()
    this.chooserRoot = undefined
    this.chooserContainer?.remove()
    this.chooserContainer = undefined
  }

  private applyChooserChoice(gesture: PendingGesture, mode: ExplorerOpenMode): void {
    if (mode === 'builtin') {
      if (gesture.subject === 'file' && gesture.path !== undefined) {
        this.openFile(gesture.path, gesture.cwd)
      } else if (gesture.subject === 'link' && gesture.url !== undefined) {
        this.openUrl(gesture.url)
      }
      return
    }
    // 'native': hand the gesture to the operating system.
    if (gesture.subject === 'file' && gesture.path !== undefined) this.openNativeFile(gesture.path)
    else if (gesture.subject === 'link' && gesture.url !== undefined) this.deps.openExternalUrl(gesture.url)
  }

  private surface(): void {
    // Open the explorer page first: the store's open reveals (expands) and
    // focuses the column, so a failing open never leaves a ghost strip tab.
    this.deps.openExplorerTab()
  }

  private pendingGesture: PendingGesture | undefined
  private chooserRoot: Root | undefined
  private chooserContainer: HTMLDivElement | undefined
}
