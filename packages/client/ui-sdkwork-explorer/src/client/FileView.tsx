/** Read-only file tab body lifecycle: read, classify, and hand to the editor. */

import { useEffect, useMemo, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { MonacoFileView } from './MonacoFileView.tsx'
import { monacoLangFromPath } from './monacoLang.ts'
import css from './FileView.module.css'

/** Extensions whose bytes are never shown as text; the card offers the native opener. */
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'heic',
  'pdf', 'zip', 'gz', 'tgz', 'bz2', '7z', 'rar', 'xz',
  'exe', 'dll', 'so', 'dylib', 'wasm', 'msi', 'apk',
  'mp3', 'mp4', 'mov', 'avi', 'mkv', 'wav', 'flac', 'ogg', 'webm',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  'psd', 'ai', 'sketch', 'fig', 'sqlite', 'db', 'pdb', 'bin', 'dat', 'o', 'a', 'lib',
])

/** Whether one path names a file the text viewer cannot render. */
export function isBinaryPath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return false
  return BINARY_EXTENSIONS.has(path.slice(dot + 1).toLowerCase())
}

/** Workspace-file reader seam the controller injects (uiWorkspace-backed). */
export interface FileReader {
  readTextFile(path: string, signal?: AbortSignal): Promise<string>
}

/** Why the viewer shows a non-content card. */
type FileViewState =
  | { phase: 'loading' }
  | { phase: 'ready'; content: string }
  | { phase: 'tooLarge' }
  | { phase: 'unsupported' }
  | { phase: 'error'; message: string }

export interface FileViewProps {
  /** Absolute file path. */
  path: string
  /** Session workspace root the path was resolved against. */
  cwd?: string | undefined
  /** Governed text-file reader (directory bridge). */
  reader: FileReader
  /** Open the path with the operating system's default application. */
  openNative: (path: string) => void
  /** Open the same file's editable source tab (the change view's header button). */
  onOpenSource?: () => void
  /** Persist the source view's edits through the governed writer. */
  onSave?: (path: string, content: string) => Promise<void>
  /** Render the editable source view instead of the read-only view. */
  sourceMode?: boolean
  /** Namespace-bound translate (the framework-injected seat). */
  t: TranslateNS<'explorer'>
}

/** Detect the governed directory bridge's oversize rejection without a type import. */
function isTooLargeError(error: unknown): boolean {
  const text = `${(error as { code?: string } | undefined)?.code ?? ''} ${(error as Error | undefined)?.message ?? ''}`
  return /file-too-large|too.?large/i.test(text)
}

/**
 * Render one file tab body: the Monaco editor surface (change view for a
 * diff/patch — read-only with the change washes; source view when asked —
 * editable with save) over the governed text read, with graceful cards for
 * oversize, unsupported, and failed reads.
 */
export function FileView({
  path, cwd, reader, openNative, onOpenSource, onSave, sourceMode = false, t,
}: FileViewProps) {
  const [state, setState] = useState<FileViewState>({ phase: 'loading' })

  useEffect(() => {
    if (isBinaryPath(path)) {
      setState({ phase: 'unsupported' })
      return
    }
    const controller = new AbortController()
    setState({ phase: 'loading' })
    reader.readTextFile(path, controller.signal)
      .then((content) => { setState({ phase: 'ready', content }) })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (isTooLargeError(error)) setState({ phase: 'tooLarge' })
        else setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => { controller.abort() }
  }, [path, cwd, reader])

  const nativeButton = (
    <button type="button" className={css.nativeButton} onClick={() => { openNative(path) }}>
      {t('file.openNative')}
    </button>
  )

  if (state.phase === 'loading') {
    return <div className={css.notice}>{t('file.loading')}</div>
  }
  if (state.phase === 'unsupported') {
    return (
      <div className={css.notice}>
        <p>{t('file.unsupported')}</p>
        {nativeButton}
      </div>
    )
  }
  if (state.phase === 'tooLarge') {
    return (
      <div className={css.notice}>
        <p>{t('file.tooLarge')}</p>
        {nativeButton}
      </div>
    )
  }
  if (state.phase === 'error') {
    return (
      <div className={css.notice}>
        <p data-error>{t('file.error', { message: state.message })}</p>
        {nativeButton}
      </div>
    )
  }

  return (
    <MonacoFileView
      path={path}
      cwd={cwd}
      content={state.content}
      sourceMode={sourceMode}
      t={t}
      onOpenSource={monacoLangFromPath(path) === 'diff' && !sourceMode ? onOpenSource : undefined}
      onSave={onSave}
    />
  )
}

/** Memo-friendly reader identity for deps arrays. */
export function useFileReader(reader: FileReader): FileReader {
  return useMemo(() => reader, [reader])
}
