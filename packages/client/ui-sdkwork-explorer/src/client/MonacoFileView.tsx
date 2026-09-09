/**
 * The Monaco-backed file tab body — the VSCode editor kernel over the
 * governed text read, with three faces:
 *
 * - **change view** (a `.diff`/`.patch` file, default): the Monaco diff
 *   editor — the kernel VSCode's git diff renders with — fed by the patch's
 *   reconstructed pre-image and post-image (see patchReconstruct): word-level
 *   change highlighting, collapsible unchanged regions, and a minimap, in
 *   inline or side-by-side layout. Un-reconstructable patches (multi-file,
 *   no hunks) fall back to the decorated text listing (green-add / red-delete
 *   whole-line washes). The header counts the changes and offers the
 *   "edit source" affordance that opens the same file's editable tab.
 * - **source view** (`sourceMode`): editable, with Ctrl/Cmd+S saving through
 *   the governed 1 MB text writer and a dirty marker in the status bar.
 * - **code view** (every other text file): the read-only editor.
 *
 * While the editor chunk imports (~1 MB, dynamic — never in the boot bundle)
 * the same content renders through the lightweight ReadBlock, so the tab
 * paints instantly and upgrades in place. Colors bridge the app's token
 * sheets (see monacoSetup), so the editor, chat code blocks, and app chrome
 * always agree.
 */

/* oxlint-disable typescript/no-unsafe-argument typescript/no-unsafe-call -- tsc owns this type boundary. */
/* oxlint-disable typescript/no-unsafe-member-access typescript/no-unsafe-assignment -- tsc owns this type boundary. */
/* oxlint-disable typescript/no-redundant-type-constituents -- same gap. */

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react'
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { ReadBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { loadMonaco, VIEWER_THEME } from './monacoSetup.ts'
import { monacoLangFromPath, fallbackShikiLang } from './monacoLang.ts'
import {
  canReconstruct, reconstructPatch,
} from './patchReconstruct.ts'
import { diffDecorations } from './diffDecorations.ts'
import { formatBytes } from './format.ts'
import css from './FileView.module.css'
import editorCss from './MonacoFileView.module.css'

/** Read-only options shared by every face (the VSCode viewer defaults, worker-free). */
function baseOptions(readOnly: boolean): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    readOnly,
    automaticLayout: true,
    minimap: { enabled: true, renderCharacters: false },
    lineNumbers: 'on',
    renderWhitespace: 'selection',
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    folding: true,
    stickyScroll: { enabled: true },
    bracketPairColorization: { enabled: true },
    guides: { indentation: true, bracketPairs: true },
    renderLineHighlight: 'all',
    occurrencesHighlight: 'singleFile',
    selectionHighlight: true,
    contextmenu: true,
    quickSuggestions: false,
    wordBasedSuggestions: 'off',
    fontSize: 13,
    lineHeight: 20,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  }
}

/** The diff editor's construction options (inline by default, side-by-side toggleable). */
export function diffOptions(): Monaco.editor.IStandaloneDiffEditorConstructionOptions {
  return {
    readOnly: true,
    automaticLayout: true,
    renderSideBySide: false,
    hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 4, revealLineCount: 20 },
    renderOverviewRuler: true,
    diffWordWrap: 'off',
    ignoreTrimWhitespace: false,
    renderIndicators: true,
    originalEditable: false,
    fontSize: 13,
    lineHeight: 20,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
  }
}

export interface MonacoFileViewProps {
  /** Absolute file path (identity + language hint). */
  path: string
  /** The file's whole text (already read; never re-read). */
  content: string
  /** The session workspace root (kept for identity parity with the tab). */
  cwd?: string | undefined
  /** Editable source view (vs the read-only view). */
  sourceMode: boolean
  /** Namespace-bound translate. */
  t: TranslateNS<'explorer'>
  /** Open the same file's editable source tab (change view header button). */
  onOpenSource?: () => void
  /** Persist the source view's content through the governed writer. */
  onSave?: (path: string, content: string) => Promise<void>
}

/**
 * The Monaco editor tab body (see the module doc).
 * @param props - see {@link MonacoFileViewProps}.
 * @returns the editor host element.
 */
export function MonacoFileView({
  path, content, sourceMode, t, onOpenSource, onSave,
}: MonacoFileViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const monacoRef = useRef<typeof Monaco | undefined>(undefined)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | undefined>(undefined)
  const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | undefined>(undefined)
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | undefined>(undefined)
  const modelsRef = useRef<{ original: Monaco.editor.ITextModel; modified: Monaco.editor.ITextModel } | undefined>(undefined)
  // The dirty baseline: the model's alternative version id at the last
  // pristine state (mount or swap) — an O(1) per-keystroke dirty check
  // instead of a whole-text string compare.
  const dirtyBaselineRef = useRef(0)
  const saveTimerRef = useRef<number | undefined>(undefined)

  const [booted, setBooted] = useState(false)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed' | undefined>(undefined)
  const [saveError, setSaveError] = useState('')
  const [sideBySide, setSideBySide] = useState(false)

  const language = useMemo(() => monacoLangFromPath(path), [path])
  const isDiff = language === 'diff'
  const changeView = isDiff && !sourceMode
  const reconstructable = useMemo(
    () => changeView && canReconstruct(content),
    [changeView, content],
  )
  const patch = useMemo(
    () => (reconstructable ? reconstructPatch(content) : undefined),
    [reconstructable, content],
  )
  // The patch's target file drives the diff editor's tokenization; the listing
  // fallback keeps the diff grammar.
  const diffModelLang = useMemo(() => {
    if (patch === undefined) return 'diff'
    return monacoLangFromPath(patch.targetPath)
  }, [patch])

  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  // One editor per mount; the file flows in through the swap effect below.
  useEffect(() => {
    let disposed = false
    void loadMonaco().then((monaco) => {
      if (disposed || hostRef.current === null) return
      monacoRef.current = monaco
      if (changeView && reconstructable && patch !== undefined) {
        // The change view: the diff editor kernel over the reconstructed pair.
        const original = monaco.editor.createModel(patch.oldText, diffModelLang)
        const modified = monaco.editor.createModel(patch.newText, diffModelLang)
        modelsRef.current = { original, modified }
        const diffEditor = monaco.editor.createDiffEditor(hostRef.current, {
          ...diffOptions(),
          theme: VIEWER_THEME,
        })
        diffEditor.setModel({ original, modified })
        diffEditorRef.current = diffEditor
      } else {
        const editor = monaco.editor.create(hostRef.current, {
          ...baseOptions(!sourceMode),
          value: content,
          language,
          theme: VIEWER_THEME,
        })
        editorRef.current = editor
        decorationsRef.current = editor.createDecorationsCollection()
        const model = editor.getModel()
        dirtyBaselineRef.current = model?.getAlternativeVersionId() ?? 0
        editor.onDidChangeCursorPosition((event) => {
          setCursor({ line: event.position.lineNumber, col: event.position.column })
        })
        editor.onDidChangeModelContent(() => {
          setDirty(model !== null && model.getAlternativeVersionId() !== dirtyBaselineRef.current)
        })
        if (sourceMode) {
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            void onSaveRef.current?.(path, editor.getValue())
          })
        }
      }
      setBooted(true)
    })
    return () => {
      disposed = true
      window.clearTimeout(saveTimerRef.current)
      editorRef.current?.dispose()
      editorRef.current = undefined
      diffEditorRef.current?.dispose()
      diffEditorRef.current = undefined
      modelsRef.current?.original.dispose()
      modelsRef.current?.modified.dispose()
      modelsRef.current = undefined
      decorationsRef.current = undefined
      setBooted(false)
    }
    // The editor's identity is the mount, not the file; mode is fixed per tab.
  }, [])

  // The diff layout toggle: apply the render mode to the live diff editor.
  useEffect(() => {
    if (!booted) return
    diffEditorRef.current?.updateOptions({ renderSideBySide: sideBySide })
  }, [sideBySide, booted])

  // Path/content switch on the single-editor faces: swap value and language.
  useEffect(() => {
    if (changeView && reconstructable) return
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (editor === undefined || monaco === undefined) return
    const model = editor.getModel()
    if (model === null) return
    if (model.getValue() !== content) model.setValue(content)
    if (model.getLanguageId() !== language) monaco.editor.setModelLanguage(model, language)
    dirtyBaselineRef.current = model.getAlternativeVersionId()
    setDirty(false)
    setSaveState(undefined)
    setSaveError('')
    editor.setScrollTop(0)
  }, [path, content, language, changeView, reconstructable])

  // Change-view washes on the listing fallback (un-reconstructable patches).
  useEffect(() => {
    if (!(changeView && !reconstructable)) return
    const monaco = monacoRef.current
    const collection = decorationsRef.current
    if (monaco === undefined || collection === undefined) return
    const model = editorRef.current?.getModel()
    if (model === null || model === undefined) return
    const stats = diffDecorations(content)
    collection.set(stats.decorations.map(decoration => ({
      range: new monaco.Range(decoration.line, 1, decoration.line, 1),
      options: {
        isWholeLine: true,
        className: DIFF_CLASS[decoration.kind].wash,
        linesDecorationsClassName: DIFF_CLASS[decoration.kind].gutter,
      },
    })))
  }, [content, changeView, reconstructable, booted])

  // The header's counts: reconstructed stats, else the listing parse.
  const changeStats = useMemo(() => {
    if (!isDiff || sourceMode) return undefined
    if (patch !== undefined) return { added: patch.added, removed: patch.removed }
    return diffDecorations(content)
  }, [isDiff, sourceMode, patch, content])

  const doSave = useCallback(() => {
    const editor = editorRef.current
    if (editor === undefined || onSaveRef.current === undefined) return
    setSaveState(undefined)
    onSaveRef.current(path, editor.getValue()).then(() => {
      setDirty(false)
      setSaveState('saved')
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => { setSaveState(undefined) }, 1500)
    }).catch((error: unknown) => {
      setSaveState('failed')
      setSaveError(error instanceof Error ? error.message : String(error))
    })
  }, [path])

  const bytes = useMemo(() => new TextEncoder().encode(content).length, [content])
  const totalLines = useMemo(() => {
    const all = content.split('\n')
    return all[all.length - 1] === '' ? all.slice(0, -1).length : all.length
  }, [content])
  const crlf = content.includes('\r\n')

  // The lightweight read view stands in while the editor chunk imports, as a
  // sibling of the editor host — the host element stays mounted across the
  // swap (same node, only `hidden` flips), so the editor created inside it
  // the moment the chunk resolves keeps its DOM.
  const readFallback = (() => {
    const allLines = content.split('\n')
    const lines = (allLines[allLines.length - 1] === '' ? allLines.slice(0, -1) : allLines)
      .slice(0, 2000)
      .map((text, index) => ({ number: index + 1, text }))
    return (
      <div className={css.root} data-pending>
        <ReadBlock
          label={path}
          lines={lines}
          totalLines={totalLines}
          lang={fallbackShikiLang(language)}
          maxLines={lines.length}
          className={css.read}
          labels={{
            window: (shown, total) => t('file.window', { shown, total }),
            copy: t('common.copy'),
            copied: t('common.copied'),
            collapseAria: t('file.collapseAria'),
            expandAria: hidden => t('file.expandAria', { hidden }),
            collapse: t('file.collapse'),
            expand: hidden => t('file.expand', { hidden }),
          }}
        />
      </div>
    )
  })()

  return (
    <div className={editorCss.root}>
      {changeStats !== undefined && (
        <div className={editorCss.header}>
          <span className={editorCss.headerStats} data-added>+{changeStats.added}</span>
          <span className={editorCss.headerStats} data-removed>−{changeStats.removed}</span>
          {changeView && reconstructable && (
            <button
              type="button"
              className={editorCss.headerButton}
              onClick={() => { setSideBySide(value => !value) }}
            >
              {sideBySide ? t('code.inline') : t('code.split')}
            </button>
          )}
          <span className={editorCss.headerSpacer} />
          {changeView && onOpenSource !== undefined && (
            <button type="button" className={editorCss.headerButton} onClick={onOpenSource}>
              {t('code.openSource')}
            </button>
          )}
        </div>
      )}
      {!booted && readFallback}
      <div ref={hostRef} className={editorCss.host} hidden={!booted || undefined} />
      <div className={editorCss.statusBar}>
        {!changeView && (
          <span className={editorCss.statusItem}>{t('code.lnCol', { line: cursor.line, col: cursor.col })}</span>
        )}
        {dirty && <span className={editorCss.statusDirty} title={t('code.dirty')}>●</span>}
        {saveState === 'saved' && <span className={editorCss.statusSaved}>{t('code.saved')}</span>}
        {saveState === 'failed' && (
          <span className={editorCss.statusFailed} title={saveError}>{t('code.saveFailed', { message: saveError })}</span>
        )}
        <span className={editorCss.headerSpacer} />
        <span className={editorCss.statusItem}>{crlf ? 'CRLF' : 'LF'}</span>
        <span className={editorCss.statusItem}>UTF-8</span>
        <span className={editorCss.statusItem}>{changeView && reconstructable ? diffModelLang : language}</span>
        <span className={editorCss.statusItem}>{t('code.lines', { lines: totalLines })}</span>
        <span className={editorCss.statusItem}>{formatBytes(bytes)}</span>
        {sourceMode ? (
          <button
            type="button"
            className={editorCss.saveButton}
            data-dirty={dirty || undefined}
            onClick={doSave}
          >
            {t('code.save')}
          </button>
        ) : (
          <button
            type="button"
            className={css.nativeButton}
            onClick={() => { void navigator.clipboard.writeText(content) }}
          >
            {t('common.copy')}
          </button>
        )}
      </div>
    </div>
  )
}

/** The diff wash classes per decoration kind (body wash + gutter strip). */
const DIFF_CLASS: Record<'add' | 'del' | 'hunk' | 'meta', { wash: string; gutter: string }> = {
  add: { wash: editorCss.diffAdd, gutter: editorCss.gutterAdd },
  del: { wash: editorCss.diffDel, gutter: editorCss.gutterDel },
  hunk: { wash: editorCss.diffHunk, gutter: editorCss.gutterHunk },
  meta: { wash: editorCss.diffMeta, gutter: editorCss.gutterMeta },
}
