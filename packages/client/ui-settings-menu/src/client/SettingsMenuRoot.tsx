/**
 * Settings menu root: the mode rail's bottom-pinned trigger (the hover
 * settings menu) plus the centered modal panel with the section nav rail
 * (figma 501:29947, 1080x700). The menu pops to the right of the trigger on
 * hover/focus/click: a header row with the account identity, the account
 * group (sign-in row while a provider advertises one, membership/points rows
 * when the account provider publishes them), the feature group (settings →
 * panel, appearance → theme submenu, help → placeholder toast,
 * check-for-updates → desktop updater), and the pinned sign-out footer row.
 * Modal open state, active section id, and menu open state are component-local
 * viewing state; the onboarding coordinator mounts exactly one ordered
 * registrant while the sessions-derived empty-Hero fact is active. Visible
 * dialog chrome belongs to the step, so a mounted-but-deciding step paints
 * nothing here.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconAgentPresetOutline16, IconCloseOutline16, IconCoinOutline16, IconCrownOutline16,
  IconDarkOutline16, IconDataOutline16, IconEditOutline16, IconFollowsystemOutline16, IconLightOutline16,
  IconLogoutOutline14, IconPersonalizationOutline16, IconQuestionOutline14, IconRefreshOutline14,
  IconSettingsOutline14, IconSettingsOutline16, IconUserOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { Menu, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsMenuRootComponentProps, SettingsSectionRow } from './shell-contract.ts'
import css from './SettingsMenuRoot.module.css'

/** Nav glyph by section id; unknown ids fall back to the settings gear. */
function navIcon(id: string) {
  if (id === 'models') return <IconDataOutline16 className={css.navIcon} size={16} />
  if (id === 'agent-presets') return <IconAgentPresetOutline16 className={css.navIcon} size={16} />
  if (id === 'plugins') return <IconPersonalizationOutline16 className={css.navIcon} size={16} />
  return <IconSettingsOutline16 className={css.navIcon} size={16} />
}

type PanelProps = {
  rows: readonly SettingsSectionRow[]
  renderSlot: SettingsMenuRootComponentProps['renderSlot']
  activeId: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
}

/**
 * The modal layer: full-viewport mask + centered panel. Close paths: the
 * header button, a mask click, and document-level Escape (mounted only while
 * open, so the listener lifetime is the panel's).
 */
function SettingsPanel({ rows, renderSlot, activeId, onSelect, onClose }: PanelProps) {
  // Entries can unmount underneath the requested id, so the render-time
  // projection falls back to the first row when the id is gone.
  const active = rows.find(r => r.id === activeId)?.id ?? rows[0]?.id
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  // Baseline focus management: entering the dialog lands on the close button.
  const closeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  return (
    <div className={css.overlay} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <nav className={css.nav}>
          <div className={css.navTitle} id={titleId}>{renderSlot('settings.header', {})}</div>
          <div className={css.navList}>
            {rows.map(row => (
              <button
                key={row.id}
                type="button"
                className={clsx(css.navCell, row.id === active && css.active)}
                aria-current={row.id === active ? 'true' : undefined}
                onClick={() => { onSelect(row.id) }}
              >
                {navIcon(row.id)}
                <span className={css.navLabel}>{row.label}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className={css.content}>
          <div className={css.header}>
            <div className={css.actions}>{renderSlot('settings.action', {})}</div>
            <button ref={closeButton} type="button" className={css.close} onClick={onClose}>
              <IconCloseOutline16 size={14} />
              <span className={css.hiddenLabel}>{renderSlot('settings.close', {})}</span>
            </button>
          </div>
          <div className={css.options}>
            {active !== undefined && renderSlot('settings.section', { close: onClose }, { only: active })}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Render the settings trigger, its hover menu, and the settings panel.
 * @param props - composed slot props (shell-contract.ts).
 * @returns the settings menu element tree.
 */
export function SettingsMenuRoot(props: SettingsMenuRootComponentProps) {
  const {
    useSections, useOnboardingSteps, useTheme, useAccount, useSessions, useFeedback,
    renderSlot, setTheme, signIn, logout, checkForUpdates, openFeedback, updatesAvailable, t,
  } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [helpToastSeq, setHelpToastSeq] = useState(0)
  const [completedOnboarding, setCompletedOnboarding] = useState<ReadonlySet<string>>(() => new Set())
  const close = useCallback(() => {
    setDialogOpen(false)
    setActiveId(undefined)
  }, [])
  const openSection = useCallback((id: string) => {
    setActiveId(id)
    setDialogOpen(true)
  }, [])

  const rows = useSections(s => s)
  const theme = useTheme(s => s)
  const account = useAccount(s => s)
  const feedback = useFeedback(s => s)
  const onboardingSteps = useOnboardingSteps(s => s)
  const onboardingActive = useSessions(state =>
    state.phase === 'ready'
    && (state.current === undefined || state.byId[state.current]?.blank === true))
  const onboardingStep = onboardingActive
    ? onboardingSteps.find(step => !completedOnboarding.has(step.id))
    : undefined

  useEffect(() => {
    if (onboardingActive) return
    setCompletedOnboarding(new Set())
  }, [onboardingActive])

  const completeOnboardingStep = useCallback((id: string) => {
    setCompletedOnboarding((previous) => {
      if (previous.has(id)) return previous
      return new Set([...previous, id])
    })
  }, [])

  // The account group carries the sign-in row while a provider advertises one
  // and the membership/points rows a signed-in provider publishes; the
  // anonymous default renders the settings/feature group directly.
  const items = useMemo<readonly MenuEntry[]>(() => {
    const entries: MenuEntry[] = []
    if (!account.signedIn && account.signInAvailable === true) {
      entries.push({ id: 'sign-in', label: t('menu.signIn'), icon: <IconUserOutline16 size={14} /> })
    }
    if (account.membership !== undefined) {
      entries.push({ id: 'membership', label: account.membership, icon: <IconCrownOutline16 size={16} /> })
    }
    if (account.points !== undefined) {
      entries.push({ id: 'points', label: t('menu.points'), icon: <IconCoinOutline16 size={16} /> })
    }
    if (entries.length > 0) entries.push({ type: 'separator', id: 'account-separator' })
    entries.push({ id: 'settings', label: t('menu.settings'), icon: <IconSettingsOutline14 size={14} /> })
    entries.push({
      id: 'appearance',
      label: t('menu.appearance'),
      icon: <IconLightOutline16 size={16} />,
      submenu: [
        { id: 'light', label: t('menu.appearance.light'), icon: <IconLightOutline16 size={16} /> },
        { id: 'dark', label: t('menu.appearance.dark'), icon: <IconDarkOutline16 size={16} /> },
        { id: 'system', label: t('menu.appearance.system'), icon: <IconFollowsystemOutline16 size={16} /> },
      ],
    })
    entries.push({ id: 'help', label: t('menu.help'), icon: <IconQuestionOutline14 size={14} /> })
    if (feedback.available) {
      entries.push({ id: 'feedback', label: t('menu.feedback'), icon: <IconEditOutline16 size={14} /> })
    }
    if (updatesAvailable) {
      entries.push({ id: 'check-updates', label: t('menu.checkUpdates'), icon: <IconRefreshOutline14 size={14} /> })
    }
    return entries
  }, [account.membership, account.points, account.signInAvailable, account.signedIn, feedback.available, t, updatesAvailable])

  const footer = useMemo<readonly MenuEntry[]>(() => [
    {
      id: 'logout',
      label: t('menu.logout'),
      icon: <IconLogoutOutline14 size={14} />,
      danger: true,
      disabled: !account.signedIn,
    },
  ], [account.signedIn, t])

  const onSelect = useCallback((id: string) => {
    setMenuOpen(false)
    if (id === 'settings') {
      setDialogOpen(true)
    } else if (id === 'light' || id === 'dark' || id === 'system') {
      setTheme(id)
    } else if (id === 'help') {
      setHelpToastSeq(seq => seq + 1)
    } else if (id === 'feedback') {
      openFeedback()
    } else if (id === 'check-updates') {
      checkForUpdates()
    } else if (id === 'sign-in') {
      signIn()
    } else if (id === 'logout') {
      logout()
    }
  }, [setTheme, signIn, logout, checkForUpdates, openFeedback])

  return (
    <>
      <Menu
        open={menuOpen}
        side="right"
        portal
        closeOnPointerLeave
        anchor={(
          <button
            type="button"
            className={css.trigger}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onPointerEnter={() => { setMenuOpen(true) }}
            onFocus={() => { setMenuOpen(true) }}
            onClick={() => { setMenuOpen(true) }}
          >
            {renderSlot('settings.trigger', {})}
          </button>
        )}
        header={account.signedIn && account.username !== undefined ? (
          <div className={css.menuHeader}>
            <IconUserOutline16 size={16} />
            <span className={css.menuUsername}>{account.username}</span>
          </div>
        ) : undefined}
        items={items}
        footer={footer}
        selectedIds={[theme.preference]}
        onSelect={onSelect}
        onClose={() => { setMenuOpen(false) }}
      />
      {dialogOpen && (
        <SettingsPanel
          rows={rows}
          renderSlot={renderSlot}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={close}
        />
      )}
      {helpToastSeq > 0 && (
        <Toast
          key={helpToastSeq}
          text={t('menu.help.soon')}
          icon={<IconQuestionOutline14 size={14} />}
          onDone={() => { setHelpToastSeq(0) }}
        />
      )}
      {/* Dialog chrome and `#root` inert ownership live inside each step's
          visible branch. A step still deciding (private facts loading)
          renders null, so nothing paints or blocks while it decides. */}
      {onboardingStep !== undefined && renderSlot('settings.onboarding', {
        stepId: onboardingStep.id,
        complete: () => { completeOnboardingStep(onboardingStep.id) },
        openSection,
      }, { only: onboardingStep.id })}
    </>
  )
}
