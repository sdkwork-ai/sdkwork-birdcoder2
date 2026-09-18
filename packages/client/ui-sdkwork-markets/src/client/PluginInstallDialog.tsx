/**
 * The install dialog: the market's one package-installation surface.
 *
 * This mirrors the upstream `ui-plugin-manager` Add-plugin dialog so the two
 * pages read identically: a single Install action that both checks and installs
 * (the Host's own order), a collapsible guide of the three spec forms in the
 * idle screen, and a headless wizard for the running / done / failed screens
 * over the same subject card. A failed run that left install scripts undecided
 * shows them for approval in place of a plain retry.
 *
 * The fork keeps its own `PluginStore` API (separate `inspectInstall` and
 * `runInstall`, and a `MarketsKey` dotted namespace rather than upstream's
 * `pluginManager` camelCase), so this is a mirror, not an import: the layout,
 * copy, and data-flow follow upstream, but the store calls stay fork-owned.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Button, IconCheckOutline16, IconChevronDownOutline14, IconChevronLeftOutline14,
  IconCloseOutline16, IconWarningOutline16, Modal, TerminalBlock,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TerminalBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarketsKey } from './locales.ts'
import type { InstallSession, PluginStore } from './pluginStore.ts'
import css from './OfficialPluginsPanel.module.css'

/** The dialog's props: a locale seat and the store that owns the run. */
export interface PluginInstallDialogProps {
  /** Translate seat of the markets namespace. */
  t: (key: MarketsKey, params?: Record<string, string>) => string
  /** The store whose install session the dialog renders. */
  store: PluginStore
  /** The open session, or `undefined` when the dialog is closed. */
  install: InstallSession | undefined
}

/** The inspection problem vocabulary, as dictionary keys. */
const PROBLEM_KEYS = {
  'invalid-spec': 'install.problem.invalid-spec',
  'already-installed': 'install.problem.already-installed',
  'not-found': 'install.problem.not-found',
  'not-a-package': 'install.problem.not-a-package',
  'not-a-bundle': 'install.problem.not-a-bundle',
  network: 'install.problem.network',
  unknown: 'install.problem.unknown',
} as const satisfies Record<string, MarketsKey>

/** One row of the install guide: a spec form's title, its example, and where the person finds it. */
interface GuideExample {
  readonly key: string
  readonly titleKey: MarketsKey
  readonly exampleKey: MarketsKey
  readonly hintKey: MarketsKey
}

/** The spec forms the install guide shows, each with an example the person can drop into the field. */
const GUIDE_EXAMPLES = [
  { key: 'id', titleKey: 'install.guide.id.title', exampleKey: 'install.guide.id.example', hintKey: 'install.guide.id.hint' },
  { key: 'git', titleKey: 'install.guide.git.title', exampleKey: 'install.guide.git.example', hintKey: 'install.guide.git.hint' },
  { key: 'path', titleKey: 'install.guide.path.title', exampleKey: 'install.guide.path.example', hintKey: 'install.guide.path.hint' },
] as const satisfies readonly GuideExample[]

/** The heading of each screen past the spec. The `ready`/`checking` screens have their own title. */
const SCREEN_TITLE_KEYS = {
  installing: 'install.screen.installing',
  cancelling: 'install.screen.cancelling',
  applying: 'install.screen.applying',
  done: 'install.screen.done',
  failed: 'install.screen.failed',
  cancelled: 'install.screen.cancelled',
} as const satisfies Record<Exclude<InstallSession['phase'], 'ready' | 'checking'>, MarketsKey>

/** What the spec's kind reads as when the package carries no description of its own. */
const SUBJECT_KIND_KEYS = {
  registry: undefined,
  path: 'install.subject.path',
  git: 'install.subject.git',
  tarball: 'install.subject.tarball',
} as const satisfies Record<NonNullable<InstallSession['inspection']>['kind'], MarketsKey | undefined>

/** The run is in flight for these phases, so the dialog stays busy. */
const PENDING: readonly InstallSession['phase'][] = ['installing', 'cancelling', 'applying']

/** TerminalBlock's display copy, owned here so the primitive stays locale-free. */
function terminalLabels(t: PluginInstallDialogProps['t']): TerminalBlockLabels {
  return {
    signal: signal => `signal ${signal}`,
    exitCode: code => `exit ${code}`,
    noExitCode: 'no exit code',
    running: t('install.running'),
    failed: t('install.failed.unknown'),
    done: t('install.done'),
    copy: t('install.log.title'),
    copied: t('install.log.title'),
    noOutput: t('install.log.title'),
    collapseAria: t('install.log.title'),
    collapse: t('install.log.title'),
    expandAria: hidden => `${t('install.log.title')} (${hidden})`,
    expand: hidden => `${t('install.log.title')} (${hidden})`,
  }
}

/** The failed screen's one line: a cancellation answer, or the Host's own diagnostic. */
function failureText(detail: string | undefined, t: PluginInstallDialogProps['t']): string {
  if (detail === 'not-running') return t('install.cancel.not-running')
  if (detail === undefined) return t('install.failed.unknown')
  return t('install.failed', { detail })
}

/** The package the install is about: its name, one-liner, and version, as the Host read them before installing. */
function SubjectCard({ inspection, spec, t }: {
  readonly inspection: NonNullable<InstallSession['inspection']>
  readonly spec: string
  readonly t: PluginInstallDialogProps['t']
}): ReactNode {
  const title = inspection.name ?? spec
  const kindKey = SUBJECT_KIND_KEYS[inspection.kind]
  const description = inspection.description ?? (kindKey === undefined ? undefined : t(kindKey))
  return (
    <div className={css.subject} data-install-subject={spec}>
      <p className={css.subjectName}>{title}</p>
      {description === undefined ? null : <p className={css.subjectDesc}>{description}</p>}
      {inspection.version === undefined ? null : <p className={css.subjectMeta}>{t('install.version', { version: inspection.version })}</p>}
    </div>
  )
}

/**
 * Render the install dialog, or nothing when no session is open.
 *
 * @param props - the locale seat, the store owning the run, and the session.
 * @returns the dialog element tree, or `null`.
 */
export function PluginInstallDialog({ t, store, install }: PluginInstallDialogProps) {
  // The spec field keeps its own draft so typing never re-runs the
  // inspection on every keystroke; the store learns the spec when asked.
  const [draft, setDraft] = useState('')
  const [guideOpen, setGuideOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const openedFor = useRef<unknown>(undefined)
  const errorId = useId()
  const guideId = useId()
  const approvalId = useId()

  useEffect(() => {
    if (install === undefined) { openedFor.current = undefined; return }
    // Reset the draft and the toggles once per opened session, not on every phase change.
    if (openedFor.current === undefined) {
      openedFor.current = 'open'
      setDraft(install.spec)
      setGuideOpen(false)
      setDetailsOpen(false)
    }
  }, [install])

  const labels = useMemo(() => terminalLabels(t), [t])
  if (install === undefined) return null

  const { phase } = install
  // The idle / checking screen: the field, the single Install action, and the guide.
  if (phase === 'ready' || phase === 'checking') {
    const checking = phase === 'checking'
    const empty = draft.trim() === ''
    return (
      <Modal
        open
        onClose={() => { store.closeInstall() }}
        title={t('install.title')}
        closeLabel={t('dialog.close')}
        description={t('install.description')}
        className={css.installDialog}
        footer={(
          <Button
            variant="primary"
            className={css.wide}
            disabled={checking || empty}
            aria-busy={checking}
            data-install-submit
            onClick={() => { store.editInstallSpec(draft); void store.runInstall().catch(() => {}) }}
          >
            {checking ? <span className={css.spinner} aria-hidden="true" /> : null}
            {t(checking ? 'install.checking' : 'install.run')}
          </Button>
        )}
      >
        <div className={css.installBody}>
          <label className={css.installField}>
            <span>{t('install.spec')}</span>
            <input
              type="text"
              value={draft}
              placeholder={t('install.spec.placeholder')}
              disabled={checking}
              aria-invalid={install.problem !== undefined}
              aria-describedby={install.problem === undefined ? undefined : errorId}
              onChange={(event) => { setDraft(event.currentTarget.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !empty && !checking) {
                  store.editInstallSpec(draft)
                  void store.runInstall().catch(() => {})
                }
              }}
            />
          </label>
          {install.problem === undefined
            ? null
            : (
              <>
                <p id={errorId} className={css.inputError} role="alert" data-install-problem={install.problem.problem}>{t(PROBLEM_KEYS[install.problem.problem as keyof typeof PROBLEM_KEYS] ?? 'install.problem.unknown')}</p>
                <p className={css.inspectDetail}>{install.problem.reason}</p>
              </>
            )}
          <button
            type="button"
            className={css.guideToggle}
            aria-expanded={guideOpen}
            aria-controls={guideId}
            onClick={() => { setGuideOpen(open => !open) }}
          >
            <IconChevronDownOutline14 className={css.guideChevron} aria-hidden="true" />
            <span>{t(guideOpen ? 'install.guide.hide' : 'install.guide.toggle')}</span>
          </button>
          {guideOpen ? (
            <div id={guideId} className={css.guide} data-install-guide>
              <p className={css.guideIntro}>{t('install.guide.intro')}</p>
              <p className={css.guideNote}>{t('install.guide.idNote')}</p>
              <ol className={css.guideList}>
                {GUIDE_EXAMPLES.map(({ key, titleKey, exampleKey, hintKey }, index) => (
                  <li key={key} className={css.guideItem}>
                    <span className={css.guideIndex} aria-hidden="true">{index + 1}</span>
                    <div className={css.guideMain}>
                      <span className={css.guideTitle}>{t(titleKey)}</span>
                      <span className={css.guideExample}>
                        <span className={css.guideExampleLabel}>{t('install.guide.exampleLabel')}</span>
                        <code>{t(exampleKey)}</code>
                      </span>
                      <span className={css.guideHint}>{t(hintKey)}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t('install.guide.fillAria', { example: t(exampleKey) })}
                      disabled={checking}
                      onClick={() => { setDraft(t(exampleKey)) }}
                    >
                      {t('install.guide.fill')}
                    </Button>
                  </li>
                ))}
              </ol>
              <p className={css.guideSafety} role="note">
                <IconWarningOutline16 size={14} aria-hidden="true" />
                <span>{t('install.guide.safety')}</span>
              </p>
            </div>
          ) : null}
        </div>
      </Modal>
    )
  }

  // The wizard screens: running, done, failed, cancelled, and the applying edge.
  const heading = t(SCREEN_TITLE_KEYS[phase])
  const pending = PENDING.includes(phase)
  // Only a run that reached its settle can be sent back to the field to edit.
  const stoppable = phase === 'failed'
  const unconfirmed = install.detail === 'too-late' ? t('install.cancel.too-late') : undefined
  const pendingBuilds = phase === 'failed' ? (install.pendingBuilds ?? []) : []
  const approvable = pendingBuilds.length > 0
  const output = install.log.map(line => line.text).join('')
  const lastArgv = install.log.length === 0 ? undefined : install.log[install.log.length - 1]
  const runNow = (approvedBuilds?: readonly string[]): void => {
    store.editInstallSpec(draft)
    void store.runInstall(approvedBuilds).catch(() => {})
  }
  const closeDialog = (): void => { store.closeInstall() }

  return (
    <Modal open onClose={closeDialog} title={heading} headless className={css.installDialog}>
      <div
        className={css.wizard}
        data-install-phase={phase}
        {...(phase === 'cancelled' ? { 'data-install-cancelled': '' } : {})}
      >
        <div className={css.wizardHead}>
          {phase === 'done'
            ? <span />
            : (
              <button
                type="button"
                className={css.wizardBack}
                aria-label={t('install.edit')}
                disabled={!stoppable}
                onClick={() => { store.openInstall(draft) }}
              >
                <IconChevronLeftOutline14 aria-hidden="true" />
                <span>{t('install.edit')}</span>
              </button>
            )}
          <button
            type="button"
            className={css.wizardClose}
            aria-label={t(phase === 'installing' ? 'install.cancelClose' : 'dialog.close')}
            disabled={pending && phase !== 'installing'}
            onClick={closeDialog}
          >
            <IconCloseOutline16 size={14} />
          </button>
        </div>
        <div className={css.wizardScroll}>
          <div className={css.wizardHero}>
            <span className={css.wizardIcon} data-tone={pending ? 'pending' : phase} aria-hidden="true">
              {pending
                ? <span className={css.spinnerLarge} />
                : phase === 'done' ? <IconCheckOutline16 size={28} /> : <IconWarningOutline16 size={28} />}
            </span>
            <h2 className={css.wizardTitle} role={phase === 'failed' ? 'alert' : 'status'}>{heading}</h2>
            {phase === 'failed' ? <p className={css.wizardSub} role="alert" data-install-failed>{failureText(install.detail, t)}</p> : null}
            {unconfirmed === undefined ? null : <p className={css.wizardSub} role="alert">{unconfirmed}</p>}
          </div>
          {install.inspection === undefined ? null : <SubjectCard inspection={install.inspection} spec={install.spec} t={t} />}
          {approvable ? (
            <section className={css.approval} role="group" aria-labelledby={approvalId} data-install-approval>
              <h3 id={approvalId} className={css.approvalTitle}>{t('install.approval.title')}</h3>
              <p className={css.approvalText}>{t('install.approval.desc')}</p>
              <ul className={css.approvalList}>
                {pendingBuilds.map(name => <li key={name}><code>{name}</code></li>)}
              </ul>
              <p className={css.approvalText}>{t('install.approval.consequence')}</p>
              <p className={css.approvalCaution}>{t('install.approval.caution')}</p>
              <Button variant="primary" className={css.wide} data-install-approve onClick={() => { runNow(install.pendingBuilds) }}>
                {t('install.approveAndRetry')}
              </Button>
            </section>
          ) : null}
          {phase === 'done' && install.bundle === undefined
            ? <p className={css.result} role="status" data-install-done>{t('install.doneNothing')}</p>
            : null}
          {phase === 'done' && install.detail === 'restart-required'
            ? <p className={css.resultWarn} role="status" data-install-done>{t('install.doneRestart')}</p>
            : null}
          {phase === 'done' && install.bundle !== undefined
            ? <p className={css.result} role="status" data-install-done>{t('install.done.known', { name: install.bundle })}</p>
            : null}
          <div className={css.wizardFoot}>
            <button
              type="button"
              className={css.detailsToggle}
              aria-expanded={detailsOpen}
              onClick={() => { setDetailsOpen(open => !open) }}
            >
              <span>{t(detailsOpen ? 'install.details.hide' : 'install.details.show')}</span>
              <IconChevronDownOutline14 className={css.detailsChevron} aria-hidden="true" />
            </button>
            {pending
              ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={phase !== 'installing'}
                  data-install-cancel
                  onClick={() => { void store.cancelInstall().catch(() => {}) }}
                >
                  {t(phase === 'cancelling' ? 'install.cancelling' : 'install.cancel')}
                </Button>
              )
              : null}
            {phase === 'failed' && !approvable ? <Button variant="primary" size="sm" onClick={() => { runNow() }}>{t('install.retry')}</Button> : null}
          </div>
          {detailsOpen
            ? (
              <div className={css.detailsBody}>
                <TerminalBlock
                  command={lastArgv?.text === undefined ? 'pnpm' : lastArgv.text}
                  output={output}
                  running={pending}
                  maxLines={12}
                  labels={labels}
                  className={css.terminal}
                />
              </div>
            )
            : null}
          {phase !== 'done'
            ? null
            : <Button variant="primary" className={css.wide} onClick={closeDialog}>{t('install.close')}</Button>}
        </div>
      </div>
    </Modal>
  )
}
