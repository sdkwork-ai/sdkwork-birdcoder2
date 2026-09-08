/**
 * Commit-and-push modal (需求图2: 居中弹窗): the header row carries the
 * branch selector label and the diff totals, the body holds the commit
 * message field plus the include-unstaged checkbox with the file count, and
 * the footer stacks the three actions — Commit (primary, Ctrl+Enter),
 * Commit and push, and Push. All facts ride the {@link SdkworkGitPort}; the
 * pill owns the status refresh after a successful action.
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { CloudUpload, GitBranch, Sparkles, Square } from 'lucide-react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SdkworkGitStatus } from '@deepseek-ai/dsh-api-sdkwork-git-controller/types'
import type { SdkworkGitPort } from './gitPort.ts'
import type { NS } from './locales.ts'
import css from './GitGraphModal.module.css'

/** Full props for the commit modal. */
export interface GitCommitModalProps {
  open: boolean
  onClose: () => void
  /** Repository directory; the modal renders only with a cwd present. */
  cwd: string
  git: SdkworkGitPort
  /** Point-in-time status snapshot the pill already holds (branch, dirty count, diff totals). */
  status: SdkworkGitStatus | null
  /** Refresh the pill's status read after a successful commit or push. */
  onDone: () => void
  t: TranslateNS<typeof NS>
}

/** One footer action row of the commit dialog (图2: full-width stacked rows). */
function ActionRow(options: {
  icon: React.ReactNode
  label: string
  hint?: string | undefined
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  const { icon, label, hint, disabled, onClick } = options
  return (
    <button type="button" className={css.commitAction} disabled={disabled} onClick={onClick}>
      <span className={css.commitActionIcon}>{icon}</span>
      <span className={css.commitActionLabel}>{label}</span>
      {hint !== undefined && <span className={css.commitActionHint}>{hint}</span>}
    </button>
  )
}

/**
 * The commit dialog: centered card with the branch/diff header, message
 * field, include-unstaged checkbox, and the stacked action footer.
 * @param props - open state, close callback, repository directory, git port,
 * status snapshot, completion callback, locale seat.
 * @returns the modal tree, or null while closed.
 */
export function GitCommitModal({ open, onClose, cwd, git, status, onDone, t }: GitCommitModalProps) {
  const [message, setMessage] = useState('')
  const [includeUnstaged, setIncludeUnstaged] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  // Re-open resets the draft: the dialog is a one-shot commit form.
  useEffect(() => {
    if (open) {
      setMessage('')
      setIncludeUnstaged(true)
      setBusy(false)
      setError(null)
      setNotice(null)
      const timer = window.setTimeout(() => { messageRef.current?.focus() }, 0)
      return () => { window.clearTimeout(timer) }
    }
    return undefined
  }, [open])

  if (!open || status === null) return null

  const hasChanges = status.dirtyCount > 0
  const canCommit = hasChanges && !busy
  const canPush = status.ahead > 0 && !busy

  /** Run one git mutation, mapping its rejection onto the inline error line. */
  const run = (action: () => Promise<string>): void => {
    if (busy) return
    setBusy(true)
    setError(null)
    action().then(
      (done) => {
        setBusy(false)
        onDone()
        onClose()
        return done
      },
      (reason: unknown) => {
        setBusy(false)
        setError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }

  const commit = (pushAfter: boolean): void => {
    const trimmed = message.trim()
    if (!canCommit || (!pushAfter && trimmed === '')) {
      // An empty message stays allowed for plain Commit only when the product
      // contract auto-generates one; the first version requires a message.
      if (trimmed === '') {
        setError(t('commit.nothingToCommit'))
        return
      }
    }
    run(async () => {
      await git.commit(cwd, trimmed, includeUnstaged)
      if (!pushAfter) return t('commit.success').replace('{commit}', '')
      const pushed = await git.push(cwd)
      return t('commit.pushSuccess').replace('{upstream}', pushed.upstream ?? pushed.branch)
    })
  }

  const pushOnly = (): void => {
    if (!canPush) return
    run(async () => {
      const pushed = await git.push(cwd)
      return t('commit.pushSuccess').replace('{upstream}', pushed.upstream ?? pushed.branch)
    })
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      commit(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('commit.title')}
      closeLabel={t('commit.title')}
      className={css.commitDialog}
      headless
    >
      <div className={css.commitBody}>
        <div className={css.commitHeader}>
          <span className={css.commitBranch}>
            <GitBranch size={13} strokeWidth={1.75} aria-hidden="true" />
            <span className={css.commitBranchName}>{status.branch ?? status.commit.slice(0, 7)}</span>
          </span>
          <span className={css.commitTotals}>
            <span className={css.diffAdd}>{t('diff.additions', { count: status.additions })}</span>
            <span className={css.diffDel}>{t('diff.deletions', { count: status.deletions })}</span>
          </span>
        </div>
        <div className={css.commitMessageField}>
          <textarea
            ref={messageRef}
            className={css.commitMessage}
            rows={5}
            value={message}
            placeholder={t('commit.messagePlaceholder')}
            aria-label={t('commit.messagePlaceholder')}
            disabled={busy}
            onChange={(event) => { setMessage(event.target.value) }}
            onKeyDown={onKeyDown}
          />
          <Sparkles size={14} strokeWidth={1.75} className={css.commitGenerate} aria-hidden="true" />
        </div>
        <label className={css.commitUnstagedRow}>
          <input
            type="checkbox"
            className={css.commitCheckbox}
            checked={includeUnstaged}
            disabled={busy || !hasChanges}
            onChange={(event) => { setIncludeUnstaged(event.target.checked) }}
          />
          <span className={css.commitUnstagedLabel}>{t('commit.includeUnstaged')}</span>
          <span className={css.commitFileCount}>{t('commit.fileCount', { count: status.dirtyCount })}</span>
        </label>
        {error !== null && <p className={css.errorLine}>{error}</p>}
        {notice !== null && <p className={css.statusLine}>{notice}</p>}
      </div>
      <div className={css.commitFooter}>
        <ActionRow
          icon={<Square size={13} strokeWidth={1.75} aria-hidden="true" />}
          label={t('commit.actionCommit')}
          hint="Ctrl+↵"
          disabled={!canCommit || message.trim() === ''}
          onClick={() => { commit(false) }}
        />
        <ActionRow
          icon={<CloudUpload size={14} strokeWidth={1.75} aria-hidden="true" />}
          label={t('commit.actionCommitPush')}
          disabled={!canCommit}
          onClick={() => { commit(true) }}
        />
        <ActionRow
          icon={<CloudUpload size={14} strokeWidth={1.75} aria-hidden="true" />}
          label={t('commit.actionPush')}
          disabled={!canPush}
          onClick={pushOnly}
        />
      </div>
    </Modal>
  )
}
