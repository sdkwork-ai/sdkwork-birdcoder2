/**
 * The applied-change diff tab body — the surface an edit/write row's file
 * link lands on. The Monaco diff editor (the kernel VSCode's git diff renders
 * with, the same one the .patch change view uses) shows the call's applied
 * hunks as a real pre/post-image change: word-level highlighting, collapsible
 * unchanged regions, and a minimap, in inline or side-by-side layout. While
 * the editor chunk imports (~1 MB, dynamic — never in the boot bundle) the
 * same hunks render through the lightweight DiffBlock, so the tab paints
 * instantly and upgrades in place.
 *
 * The header counts the changes, toggles the diff layout, and offers the
 * "edit source" affordance that opens the changed file's editable tab — the
 * preview is read-only by contract, the source tab is its editing face.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { DiffBlock, diffTotals, type DiffBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { loadMonaco, VIEWER_THEME } from './monacoSetup.ts'
import { monacoLangFromPath } from './monacoLang.ts'
import { diffPair } from './diffPairModel.ts'
import { diffOptions } from './MonacoFileView.tsx'
import type { ExplorerDiffHunk } from './bus.ts'
import css from './FileView.module.css'
import editorCss from './MonacoFileView.module.css'

/* oxlint-disable typescript/no-unsafe-argument typescript/no-unsafe-call -- tsc owns this type boundary. */
/* oxlint-disable typescript/no-unsafe-member-access -- tsc owns this type boundary. */
/* oxlint-disable typescript/no-redundant-type-constituents -- same gap. */

export interface DiffTabViewProps {
  /** Absolute path of the changed file (identity + the diff models' language hint). */
  path: string
  /** The applied hunks of that file, in file order. */
  hunks: readonly ExplorerDiffHunk[]
  /** Namespace-bound translate. */
  t: TranslateNS<'explorer'>
  /** Open the changed file's editable source tab (the header button). */
  onOpenSource: () => void
}

/**
 * Render one applied-change diff tab body (see the module doc).
 * @param props - see {@link DiffTabViewProps}.
 * @returns the diff tab body element.
 */
export function DiffTabView({ path, hunks, t, onOpenSource }: DiffTabViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | undefined>(undefined)
  const modelsRef = useRef<{ original: Monaco.editor.ITextModel; modified: Monaco.editor.ITextModel } | undefined>(undefined)

  const [booted, setBooted] = useState(false)
  const [sideBySide, setSideBySide] = useState(false)

  // The changed file's own language tokenizes both diff models, so the change
  // reads in the file's syntax rather than the diff grammar.
  const language = useMemo(() => monacoLangFromPath(path), [path])
  const pair = useMemo(() => diffPair(hunks), [hunks])
  const totals = useMemo(() => diffTotals([...hunks]), [hunks])
  const labels = useMemo<DiffBlockLabels>(() => ({
    copy: t('common.copy'),
    copied: t('common.copied'),
    collapseAria: t('file.collapseAria'),
    expandAria: hidden => t('file.expandAria', { hidden }),
    collapse: t('file.collapse'),
    expand: hidden => t('file.expand', { hidden }),
    files: count => t('diff.files', { count }),
  }), [t])

  // One diff editor per mount; a hunk refresh flows in through the swap
  // effect below.
  useEffect(() => {
    let disposed = false
    void loadMonaco().then((monaco) => {
      if (disposed || hostRef.current === null) return
      const original = monaco.editor.createModel(pair.oldText, language)
      const modified = monaco.editor.createModel(pair.newText, language)
      modelsRef.current = { original, modified }
      const diffEditor = monaco.editor.createDiffEditor(hostRef.current, {
        ...diffOptions(),
        theme: VIEWER_THEME,
      })
      diffEditor.setModel({ original, modified })
      diffEditorRef.current = diffEditor
      setBooted(true)
    })
    return () => {
      disposed = true
      diffEditorRef.current?.dispose()
      diffEditorRef.current = undefined
      modelsRef.current?.original.dispose()
      modelsRef.current?.modified.dispose()
      modelsRef.current = undefined
      setBooted(false)
    }
    // The editor's identity is the mount, not the change.
  }, [])

  // A re-opened diff tab refreshes in place (TabStore's one-change-tab-per-file
  // contract): swap both models instead of rebuilding the editor.
  useEffect(() => {
    if (!booted) return
    const models = modelsRef.current
    if (models === undefined) return
    if (models.original.getValue() !== pair.oldText) models.original.setValue(pair.oldText)
    if (models.modified.getValue() !== pair.newText) models.modified.setValue(pair.newText)
  }, [booted, pair])

  // The diff layout toggle: apply the render mode to the live diff editor.
  useEffect(() => {
    if (!booted) return
    diffEditorRef.current?.updateOptions({ renderSideBySide: sideBySide })
  }, [sideBySide, booted])

  return (
    <div className={editorCss.root}>
      <div className={editorCss.header}>
        <span className={editorCss.headerStats} data-added>+{totals.added}</span>
        <span className={editorCss.headerStats} data-removed>−{totals.removed}</span>
        <button
          type="button"
          className={editorCss.headerButton}
          onClick={() => { setSideBySide(value => !value) }}
        >
          {sideBySide ? t('code.inline') : t('code.split')}
        </button>
        <span className={editorCss.headerSpacer} />
        <button type="button" className={editorCss.headerButton} onClick={onOpenSource}>
          {t('code.openSource')}
        </button>
      </div>
      {!booted && (
        <div className={css.root} data-pending>
          <DiffBlock diffs={[...hunks]} labels={labels} maxLines={Infinity} className={css.read} />
        </div>
      )}
      <div ref={hostRef} className={editorCss.host} hidden={!booted || undefined} />
    </div>
  )
}
