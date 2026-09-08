/**
 * Session-header git branch pill: shows the current session project's
 * checked-out branch (plus uncommitted-change count in the popover) and opens
 * a branch-switcher popover — search, one-click checkout, plus the two
 * product dialogs: create-and-checkout (centered form modal) and the git
 * graph (centered near-fullscreen modal). All repository facts come from the
 * `sdkworkGit` Remote through the {@link SdkworkGitPort}; the pill renders
 * nothing when the session has no project directory or the host rejects git
 * reads (no repository, capability absent).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRightLeft, Check, ChevronDown, FileDiff, GitBranch, GitGraph, Plus, Search,
} from 'lucide-react'
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  useAnchoredPosition, useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  SdkworkGitBranch, SdkworkGitLogEntry, SdkworkGitStatus,
} from '@deepseek-ai/dsh-api-sdkwork-git-controller/types'
import type { SdkworkGitPort } from './gitPort.ts'
import { GitCommitModal } from './GitCommitModal.tsx'
import { GitCreateBranchModal } from './GitCreateBranchModal.tsx'
import { GitGraphModal } from './GitGraphModal.tsx'
import { NS } from './locales.ts'
import css from './GitBranchPill.module.css'

/** Full props for the session-header git pill. */
export type GitBranchPillProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<typeof NS>
  & {
    /** Port over the host git capability (Remote-backed). */
    git: SdkworkGitPort
  }

/** Pre-measurement panel style: fixed but invisible so the clamp reads real size. */
const MEASURE_STYLE = { position: 'fixed', visibility: 'hidden' } as const

/**
 * Session-header git tools pill (需求图1: 右上角「Git 工具」面板 — 更改行、
 * 分支行、提交或推送入口、最近提交进程列表). Renders nothing until the
 * session's project directory resolves and one status read succeeds, so
 * compositions without a repository (or without the host capability) keep
 * the header unchanged.
 * @param props - runtime slot currency, the git port, and the locale seat.
 * @returns the pill trigger, plus the portaled panel and product dialogs while open.
 */
export function GitBranchPill({ sessionId, useSessions, git, t }: GitBranchPillProps) {
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)
  const [status, setStatus] = useState<SdkworkGitStatus | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [branchPickerOpen, setBranchPickerOpen] = useState(false)
  const [branches, setBranches] = useState<readonly SdkworkGitBranch[] | null>(null)
  const [history, setHistory] = useState<readonly SdkworkGitLogEntry[] | null>(null)
  const [listError, setListError] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  const rootRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  /** Mirrors `status !== null` so refresh callbacks never re-create. */
  const hasStatusRef = useRef(false)
  /**
   * Per-directory branch-listing cache, invalidated by every status refresh
   * (a refresh may follow checkout or branch-create, which change the list).
   */
  const branchesCacheRef = useRef<{ cwd: string; branches: readonly SdkworkGitBranch[] } | null>(null)
  const panelPosition = useAnchoredPosition({
    open,
    anchorRef: triggerRef,
    panelRef,
    side: 'bottom',
    gap: 5,
    margin: 16,
  })
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)

  /**
   * One status refresh; failures hide the pill (repo absent, capability off).
   * The first refresh holds the pill pending so the skeleton renders
   * immediately instead of leaving the header blank until the host's git
   * reads settle; once a status is held, refreshes swap the label in place.
   */
  const reloadStatus = useCallback((directory: string): (() => void) => {
    let alive = true
    // Any status refresh may follow a branch mutation (checkout, create);
    // drop the cached branch list so the next picker open re-reads it.
    branchesCacheRef.current = null
    setPending(!hasStatusRef.current)
    git.status(directory).then(
      (next) => {
        if (!alive) return
        hasStatusRef.current = true
        setStatus(next)
        setPending(false)
        setFailed(false)
      },
      () => {
        if (!alive) return
        setStatus(null)
        setPending(false)
        setFailed(true)
      },
    )
    return () => { alive = false }
  }, [git])

  useEffect(() => {
    if (cwd === undefined || cwd.trim() === '') return undefined
    hasStatusRef.current = false
    return reloadStatus(cwd)
  }, [cwd, reloadStatus])

  /**
   * Load the branch list when the panel's inline picker opens. A cache hit
   * (same directory, no status refresh since) renders instantly with no git
   * spawn; a miss reads the repository once and fills the cache.
   */
  const loadBranches = useCallback((directory: string): (() => void) => {
    const cached = branchesCacheRef.current
    if (cached !== null && cached.cwd === directory) {
      setBranches(cached.branches)
      setListError(false)
      return undefined
    }
    let alive = true
    setBranches(null)
    setListError(false)
    git.branches(directory).then(
      (next) => {
        if (!alive) return
        branchesCacheRef.current = { cwd: directory, branches: next.branches }
        setBranches(next.branches)
      },
      () => {
        if (!alive) return
        setListError(true)
      },
    )
    return () => { alive = false }
  }, [git])

  useEffect(() => {
    if (!open || !branchPickerOpen || cwd === undefined) return undefined
    return loadBranches(cwd)
  }, [open, branchPickerOpen, cwd, loadBranches])

  /** Load the recent-commit history every time the panel opens. */
  const loadHistory = useCallback((directory: string): (() => void) => {
    let alive = true
    setHistory(null)
    git.log(directory, 5).then(
      (entries) => {
        if (!alive) return
        setHistory(entries)
      },
      () => {
        if (!alive) return
        setHistory([])
      },
    )
    return () => { alive = false }
  }, [git])

  useEffect(() => {
    if (!open || cwd === undefined) return undefined
    return loadHistory(cwd)
  }, [open, cwd, loadHistory])

  // Focus the search field once the inline branch picker is mounted.
  useEffect(() => {
    if (!open || !branchPickerOpen) return
    const timer = window.setTimeout(() => { searchRef.current?.focus() }, 0)
    return () => { window.clearTimeout(timer) }
  }, [open, branchPickerOpen])

  // No project directory, or the host rejected git reads (no repository,
  // capability absent): keep the header unchanged. While the first status
  // read is in flight the skeleton pill below renders instead, so the header
  // shows a stable git entry immediately.
  if (failed || status === null || cwd === undefined || cwd.trim() === '') {
    if (pending && cwd !== undefined && cwd.trim() !== '') {
      return (
        <span ref={rootRef} className={css.anchor}>
          <button
            type="button"
            className={clsx(css.pill, css.pillPending)}
            disabled
            aria-busy="true"
            aria-label={t('pill.openAria')}
          >
            <GitBranch size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className={clsx(css.pillLabel, css.pillSkeleton)}>{t('pill.loading')}</span>
          </button>
        </span>
      )
    }
    return null
  }

  const branchLabel = status.branch ?? status.commit.slice(0, 7)
  const closePanel = (): void => {
    setOpen(false)
    setBranchPickerOpen(false)
    setCheckoutError(null)
    setQuery('')
    triggerRef.current?.focus()
  }
  const toggle = (): void => {
    if (open) closePanel(); else setOpen(true)
  }
  /** Close the panel and open one of the product dialogs from its rows. */
  const openDialog = (dialog: 'create' | 'graph' | 'commit'): void => {
    closePanel()
    if (dialog === 'create') setCreateOpen(true)
    else if (dialog === 'graph') setGraphOpen(true)
    else setCommitOpen(true)
  }
  const checkout = (branch: string): void => {
    if (busy) return
    setBusy(true)
    setCheckoutError(null)
    git.checkout(cwd, branch).then(
      () => {
        setBusy(false)
        setBranchPickerOpen(false)
        reloadStatus(cwd)
      },
      (reason: unknown) => {
        setBusy(false)
        setCheckoutError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    if (branchPickerOpen) setBranchPickerOpen(false); else closePanel()
  }

  const trimmedQuery = query.trim().toLowerCase()
  const visibleBranches = (branches ?? []).filter(branch => trimmedQuery === ''
    || branch.name.toLowerCase().includes(trimmedQuery))

  const historyPanel = open
    ? createPortal((
      <div
        ref={panelRef}
        className={css.panel}
        style={panelPosition ?? MEASURE_STYLE}
        role="dialog"
        aria-label={t('pill.openAria')}
      >
        <div className={css.panelHeader}>
          <span className={css.panelTitle}>{t('panel.title')}</span>
        </div>
        <div className={css.panelScroll}>
          <button
            type="button"
            className={css.toolRow}
            disabled={busy}
            aria-label={t('panel.changes')}
            onClick={() => { openDialog('commit') }}
          >
            <FileDiff size={14} strokeWidth={1.75} aria-hidden="true" />
            <span className={css.toolRowLabel}>{t('panel.changes')}</span>
            <span className={css.diffTotals}>
              <span className={css.diffAdd}>{t('diff.additions', { count: status.additions })}</span>
              <span className={css.diffDel}>{t('diff.deletions', { count: status.deletions })}</span>
            </span>
          </button>
          <button
            type="button"
            className={css.branchRow}
            disabled={busy}
            aria-expanded={branchPickerOpen}
            onClick={() => { setBranchPickerOpen(current => !current) }}
          >
            <GitBranch size={14} strokeWidth={1.75} aria-hidden="true" />
            <span className={css.toolRowLabel}>{branchLabel}</span>
            <ChevronDown size={12} strokeWidth={2} className={css.pillChevron} aria-hidden="true" />
          </button>
          {branchPickerOpen && (
            <div className={css.branchPicker}>
              <div className={css.searchField}>
                <Search size={14} strokeWidth={1.75} className={css.searchIcon} aria-hidden="true" />
                <input
                  ref={searchRef}
                  className={css.search}
                  type="text"
                  value={query}
                  placeholder={t('popover.searchPlaceholder')}
                  aria-label={t('popover.searchPlaceholder')}
                  onChange={(event) => { setQuery(event.target.value) }}
                />
              </div>
              <div className={css.pickerList}>
                <div className={css.section}>{t('popover.branchesSection')}</div>
                {visibleBranches.map(branch => (
                  <button
                    key={branch.name}
                    type="button"
                    className={css.row}
                    disabled={busy}
                    onClick={() => {
                      if (branch.current) return
                      checkout(branch.name)
                    }}
                  >
                    <span className={css.rowTitle}>
                      <GitBranch size={13} strokeWidth={1.75} aria-hidden="true" />
                      <span className={css.rowName}>{branch.name}</span>
                      {branch.current && <Check size={14} strokeWidth={2} className={css.rowCheck} aria-hidden="true" />}
                    </span>
                    {branch.current && status.dirtyCount > 0 && (
                      <span className={css.dirty}>{t('popover.dirty', { count: status.dirtyCount })}</span>
                    )}
                  </button>
                ))}
                {branches !== null && visibleBranches.length === 0 && (
                  <div className={css.statusLine}>{t('popover.empty')}</div>
                )}
                {branches === null && !listError && <div className={css.statusLine}>{t('popover.loading')}</div>}
              </div>
              <div className={css.footer}>
                <button
                  type="button"
                  className={css.footerRow}
                  disabled={busy}
                  onClick={() => { openDialog('create') }}
                >
                  <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>{t('popover.createBranch')}</span>
                </button>
              </div>
              {listError && <div className={css.errorLine}>{t('popover.error')}</div>}
              {checkoutError !== null && <div className={css.errorLine}>{checkoutError}</div>}
            </div>
          )}
          <button
            type="button"
            className={css.toolRow}
            disabled={busy}
            onClick={() => { openDialog('commit') }}
          >
            <ArrowRightLeft size={14} strokeWidth={1.75} aria-hidden="true" />
            <span className={css.toolRowLabel}>{t('panel.commitOrPush')}</span>
          </button>
          <div className={css.historySection}>
            <span className={css.historyTitle}>{t('panel.historySection')}</span>
            {history === null && <div className={css.statusLine}>{t('panel.loading')}</div>}
            {history !== null && history.length === 0 && (
              <div className={css.statusLine}>{t('panel.historyEmpty')}</div>
            )}
            {history !== null && history.map(entry => (
              <div key={entry.hash} className={css.historyRow}>
                <span className={css.historyState} aria-hidden="true">
                  {entry.refs.head !== null
                    ? <Check size={12} strokeWidth={2} className={css.historyDone} />
                    : <ArrowRightLeft size={12} strokeWidth={1.75} className={css.historyPending} />}
                </span>
                <span className={css.historySubject} title={entry.subject}>{entry.subject}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Git graph: the panel's persistent bottom entry (below the history
            section) so the near-fullscreen dialog stays reachable without
            expanding the branch picker. */}
        <div className={css.panelFooter}>
          <button
            type="button"
            className={css.footerRow}
            disabled={busy}
            onClick={() => { openDialog('graph') }}
          >
            <GitGraph size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>{t('popover.gitGraph')}</span>
          </button>
        </div>
      </div>
    ), document.body)
    : null

  return (
    <span ref={rootRef} className={css.anchor} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={clsx(css.pill, open && css.pillOpen)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('pill.openAria')}
        title={status.branch ?? t('pill.detached')}
        onClick={toggle}
      >
        <GitBranch size={13} strokeWidth={1.75} aria-hidden="true" />
        <span className={css.pillLabel}>{branchLabel}</span>
        <ChevronDown size={12} strokeWidth={2} className={css.pillChevron} aria-hidden="true" />
      </button>
      {historyPanel}
      <GitCommitModal
        open={commitOpen}
        onClose={() => { setCommitOpen(false) }}
        cwd={cwd}
        git={git}
        status={status}
        onDone={() => { reloadStatus(cwd) }}
        t={t}
      />
      <GitCreateBranchModal
        open={createOpen}
        onClose={() => { setCreateOpen(false) }}
        cwd={cwd}
        git={git}
        onCreated={() => { reloadStatus(cwd) }}
        t={t}
      />
      <GitGraphModal
        open={graphOpen}
        onClose={() => { setGraphOpen(false) }}
        cwd={cwd}
        git={git}
        t={t}
      />
    </span>
  )
}
