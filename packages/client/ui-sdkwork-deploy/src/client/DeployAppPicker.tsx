/**
 * Two-stage source picker for the standalone 发布应用 entry.
 *
 * Step 1 chooses the sdkwork-specs app type. Step 2 lists the current project's
 * manifest-carrying roots of that type plus a custom-directory tile. Selecting
 * the source then continues into the existing publish flow.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  DEPLOY_APP_TYPE_CARDS,
  publishingTranslator,
  type PublishingMessageKey,
} from '@sdkwork/deployments-pc-console-publishing'
import { IconChevronRightOutlineRegular, IconFolderOpenOutlineRegular, IconLayersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { deploymentsLocale, type DeployLocaleFace, type DeployPublishThemePort } from './deployPorts.ts'
import type { DeployHost } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import { projectAppCardId, projectAppDraft, type ProjectAppState } from './projectApp.ts'
import dialogs from './DeployDialogs.module.css'
import css from './DeployAppPicker.module.css'

/** Props for the standalone app source picker. */
export interface DeployAppPickerProps {
  readonly host: DeployHost
  readonly theme: DeployPublishThemePort
  readonly locale: DeployLocaleFace
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly directory?: string | undefined
  readonly onSelect: (directory: string, cardId?: string) => void
  readonly onClose: () => void
  /** Replaces the picker content after a selection, inside the same overlay. */
  readonly children?: ReactNode
}

/** One canonical app root row. */
interface PickerEntry {
  readonly directory: string
  readonly name: string
  readonly cardId?: string
  readonly description?: string
  readonly iconUrl?: string
  readonly linkedAppId?: string
  readonly linkedAppName?: string
  readonly state: ProjectAppState
}

type Stage = 'type' | 'source'

/**
 * Render the two-stage app source picker.
 * @param props - host, theme/locale seats, project directory, selection, and close.
 * @returns the picker modal.
 */
export function DeployAppPicker({
  host, theme, locale: localeFace, t, directory, onSelect, onClose, children,
}: DeployAppPickerProps) {
  const subscribeTheme = useCallback((listener: () => void) => theme.subscribe(listener), [theme])
  const readTheme = useCallback(() => theme.getColorScheme(), [theme])
  const colorScheme = useSyncExternalStore(subscribeTheme, readTheme, readTheme)
  const subscribeLocale = useCallback((listener: () => void) => localeFace.subscribe(listener), [localeFace])
  const readLocale = useCallback(() => localeFace.getSnapshot(), [localeFace])
  const localeSnapshot = useSyncExternalStore(subscribeLocale, readLocale, readLocale)
  const publishingT = useMemo(
    () => publishingTranslator(deploymentsLocale(localeSnapshot.active)),
    [localeSnapshot.active],
  )
  const [stage, setStage] = useState<Stage>('type')
  const [selectedType, setSelectedType] = useState<string>()
  const [entries, setEntries] = useState<readonly PickerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [selectedApp, setSelectedApp] = useState<string>()
  const [customDirectory, setCustomDirectory] = useState<string>()
  const [customSelected, setCustomSelected] = useState(false)
  const [customReading, setCustomReading] = useState(false)
  const [customDetected, setCustomDetected] = useState<string>()
  const [customError, setCustomError] = useState<string>()

  const root = directory ?? host.readDefaultDirectory()

  const scan = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      const discovered = root === undefined || root.trim() === ''
        ? []
        : await discoverPickerEntries(host, root)
      setEntries([...discovered].sort((left, right) => {
        const linked = Number(right.state.linkedAppId !== undefined) - Number(left.state.linkedAppId !== undefined)
        return linked !== 0 ? linked : left.name.localeCompare(right.name)
      }))
    } catch (cause) {
      setError(t('templateCenter.picker.failed', { message: messageOf(cause) }))
    } finally {
      setLoading(false)
    }
  }, [host, root, t])

  useEffect(() => { void scan() }, [scan])

  const selectedTypeCard = DEPLOY_APP_TYPE_CARDS.find(card => card.id === selectedType)
  const typeName = selectedTypeCard === undefined ? t('templateCenter.picker.typeUnknown') : publishingT(selectedTypeCard.labelKey)
  const matchingEntries = selectedType === undefined
    ? []
    : entries.filter(entry => entry.cardId === selectedType)
  const customCompatible = customDirectory !== undefined
    && (customDetected === undefined || customDetected === selectedType)
  const canContinue = stage === 'type'
    ? selectedType !== undefined
    : selectedApp !== undefined || (customSelected && customCompatible)

  const chooseType = (cardId: string): void => {
    setSelectedType(cardId)
    setSelectedApp(undefined)
    setCustomDirectory(undefined)
    setCustomDetected(undefined)
    setCustomError(undefined)
    setCustomSelected(false)
  }

  const chooseCustom = async (): Promise<void> => {
    const picked = await host.pickDirectory(customDirectory ?? root)
    if (picked === undefined || picked === '') return
    setSelectedApp(undefined)
    setCustomDirectory(picked)
    setCustomReading(true)
    setCustomError(undefined)
    const state = await host.readProjectApp(picked)
    const detected = projectAppCardId(state.identity)
    setCustomDetected(detected)
    setCustomReading(false)
    if (detected !== undefined && selectedType !== undefined && detected !== selectedType) {
      setCustomSelected(false)
      setCustomError(t('templateCenter.picker.typeMismatch', {
        detected: cardTypeLabel(detected, publishingT, t),
        selected: typeName,
      }))
      return
    }
    setCustomSelected(true)
  }

  const continueNext = (): void => {
    if (stage === 'type') {
      if (selectedType !== undefined) setStage('source')
      return
    }
    if (selectedApp !== undefined) {
      const entry = matchingEntries.find(candidate => candidate.directory === selectedApp)
      if (entry !== undefined) onSelect(entry.directory, selectedType)
      return
    }
    if (customSelected && customCompatible) {
      onSelect(customDirectory, selectedType)
    }

  }

  if (children !== undefined) {
    return (
      <div className={dialogs.overlay} data-theme={colorScheme} role="dialog" aria-modal="true" aria-label={t('templateCenter.picker.title')}>
        <div className={css.embeddedHost}>{children}</div>
      </div>
    )
  }

  return (
    <div className={dialogs.overlay} data-theme={colorScheme} role="dialog" aria-modal="true" aria-label={t('templateCenter.picker.title')}>
      <div className={css.modal}>
        <header className={css.header}>
          <div className={css.titleBlock}>
            <span className={css.titleGlyph} aria-hidden="true">
              <IconLayersOutlineRegular size={16} />
            </span>
            <div>
              <h2 className={css.title}>{t('templateCenter.picker.title')}</h2>
              <p className={css.subtitle}>{t('templateCenter.picker.subtitle')}</p>
            </div>
          </div>
          <button type="button" className={dialogs.closeButton} onClick={onClose} aria-label={t('templateCenter.picker.close')}>
            ✕
          </button>
        </header>

        <div className={css.body}>
          {stage === 'type' && (
            <section className={css.typeStage}>
              <div className={css.typeStageHead}>
                <h3 className={css.sectionTitle}>{t('templateCenter.picker.selectType')}</h3>
                <p className={css.sectionHint}>{t('templateCenter.picker.typeStepHint')}</p>
              </div>
              <div className={css.typeStageGrid} role="radiogroup" aria-label={t('templateCenter.picker.selectType')}>
                {DEPLOY_APP_TYPE_CARDS.map(card => (
                  <button
                    key={card.id}
                    type="button"
                    role="radio"
                    aria-checked={card.id === selectedType}
                    className={css.typeStageCard}
                    data-card={card.id}
                    data-selected={card.id === selectedType}
                    onClick={() => { chooseType(card.id) }}
                  >
                    <span className={css.typeCardName}>{publishingT(card.labelKey)}</span>
                    <span className={css.typeCardHint}>{publishingT(card.hintKey)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {stage === 'source' && (
            <section className={css.sourceStage}>
              <div className={css.sourceHead}>
                <div>
                  <span className={css.sourceTypeLabel}>{t('templateCenter.picker.selectedType')}</span>
                  <h3 className={css.sourceTypeName}>{typeName}</h3>
                  <p className={css.sectionHint}>{t('templateCenter.picker.matchingHint')}</p>
                </div>
                <div className={css.sourceHeadActions}>
                  {root !== undefined && <span className={css.rootPath} title={root}>{root}</span>}
                  <button type="button" className={css.secondaryButton} onClick={() => { setStage('type') }}>
                    {t('templateCenter.picker.changeType')}
                  </button>
                </div>
              </div>

              {loading && <p className={css.stateText}>{t('templateCenter.picker.loading')}</p>}
              {!loading && error !== undefined && (
                <div className={css.errorCard} role="alert">
                  <span>{error}</span>
                  <button type="button" className={css.ghostButton} onClick={() => { void scan() }}>
                    {t('templateCenter.picker.retry')}
                  </button>
                </div>
              )}
              {!loading && error === undefined && (
                <>
                  <ul className={css.appList}>
                    <li key="__custom">
                      {customDirectory === undefined
                        ? (
                          <button
                            type="button"
                            className={`${css.appRow} ${css.appAdd}`}
                            aria-label={t('templateCenter.picker.addCustom')}
                            onClick={() => { void chooseCustom() }}
                          >
                            <span className={css.appAddGlyph} aria-hidden="true">+</span>
                          </button>
                        )
                        : (
                          <div
                            className={css.appRow}
                            data-selected={customSelected}
                            role="radio"
                            aria-checked={customSelected}
                            tabIndex={0}
                            onClick={() => {
                              if (customCompatible) {
                                setCustomSelected(true)
                                setSelectedApp(undefined)
                              }
                            }}
                            onKeyDown={(event) => {
                              if ((event.key === 'Enter' || event.key === ' ') && customCompatible) {
                                event.preventDefault()
                                setCustomSelected(true)
                                setSelectedApp(undefined)
                              }
                            }}
                          >
                            <input
                              type="radio"
                              name="deploy-app-source"
                              className={css.appRadio}
                              checked={customSelected}
                              disabled={!customCompatible}
                              onChange={() => {
                                setCustomSelected(true)
                                setSelectedApp(undefined)
                              }}
                              onClick={(event) => { event.stopPropagation() }}
                            />
                            <span className={css.appIcon} aria-hidden="true">
                              <IconFolderOpenOutlineRegular size={18} />
                            </span>
                            <span className={css.appMain}>
                              <span className={css.appNameRow}>
                                <span className={css.appName}>{t('templateCenter.picker.customTitle')}</span>
                                <span className={css.typeBadge}>{typeName}</span>
                              </span>
                              <span className={css.appPath} title={customDirectory}>{customDirectory}</span>
                              <span className={css.appDescription}>
                                {customReading
                                  ? t('templateCenter.picker.reading')
                                  : customError ?? t('templateCenter.picker.customCompatible', { type: typeName })}
                              </span>
                            </span>
                            <span className={css.rowAction}>
                              <button
                                type="button"
                                className={css.secondaryButton}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void chooseCustom()
                                }}
                              >
                                <IconFolderOpenOutlineRegular size={15} />
                                {t('templateCenter.picker.customChange')}
                              </button>
                            </span>
                          </div>
                        )}
                    </li>

                    {matchingEntries.map(entry => (
                      <li key={entry.directory}>
                        <label className={css.appRow} data-selected={selectedApp === entry.directory}>
                          <input
                            type="radio"
                            name="deploy-app-source"
                            className={css.appRadio}
                            checked={selectedApp === entry.directory}
                            onChange={() => {
                              setSelectedApp(entry.directory)
                              setCustomSelected(false)
                            }}
                          />
                          <span className={css.appIcon} aria-hidden="true">
                            <AppGlyph url={entry.iconUrl} />
                          </span>
                          <span className={css.appMain}>
                            <span className={css.appNameRow}>
                              <span className={css.appName}>{entry.name}</span>
                              {entry.state.linkedAppId !== undefined && (
                                <span className={css.linkedBadge}>
                                  {t('templateCenter.picker.linked', { name: entry.linkedAppName ?? entry.name })}
                                </span>
                              )}
                            </span>
                            <span className={css.appPath} title={entry.state.sourceDirectory ?? entry.directory}>
                              {entry.state.sourceDirectory ?? entry.directory}
                            </span>
                            {entry.description !== undefined && <span className={css.appDescription}>{entry.description}</span>}
                          </span>
                          <span className={css.rowAction}>
                            {selectedApp === entry.directory
                              ? t('templateCenter.picker.selected')
                              : t('templateCenter.picker.choose')}
                            <IconChevronRightOutlineRegular size={14} />
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {matchingEntries.length === 0 && (
                    <p className={css.stateText}>{t('templateCenter.picker.noMatching')}</p>
                  )}
                  {customError !== undefined && <p className={css.customError} role="alert">{customError}</p>}
                </>
              )}
            </section>
          )}
        </div>

        <footer className={css.footer}>
          <button type="button" className={css.secondaryButton} onClick={onClose}>
            {t('templateCenter.picker.cancel')}
          </button>
          {stage === 'source' && (
            <button type="button" className={css.secondaryButton} onClick={() => { setStage('type') }}>
              {t('templateCenter.picker.previous')}
            </button>
          )}
          <button
            type="button"
            className={css.primaryButton}
            disabled={!canContinue}
            onClick={continueNext}
          >
            {t('templateCenter.picker.next')}
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Manifest icon with a neutral fallback when the remote image fails. */
function AppGlyph({ url }: { readonly url?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [url])
  if (url === undefined || failed) return <IconLayersOutlineRegular size={18} />
  return <img src={url} alt="" onError={() => { setFailed(true) }} />
}

/** Human label for a card id. */
function cardTypeLabel(
  cardId: string,
  publishingT: (key: PublishingMessageKey) => string,
  t: (key: DeployKey) => string,
): string {
  const card = DEPLOY_APP_TYPE_CARDS.find(candidate => candidate.id === cardId)
  return card === undefined ? t('templateCenter.picker.typeUnknown') : publishingT(card.labelKey)
}

/**
 * Discover the project root and its direct apps/ children through the host
 * inspection bridge, then keep only roots carrying a governed manifest.
 */
async function discoverPickerEntries(host: DeployHost, root: string): Promise<PickerEntry[]> {
  const inspection = await host.inspectDirectory(root)
  const candidates = inspection === undefined
    ? [root]
    : [
      inspection.rootPath,
      ...inspection.appsChildDirectories.map(name => joinPath(joinPath(inspection.rootPath, 'apps'), name)),
    ]
  const seen = new Set<string>()
  const entries: PickerEntry[] = []
  for (const directory of candidates) {
    if (seen.has(directory)) continue
    seen.add(directory)
    const state = await host.readProjectApp(directory)
    if (!state.hasManifest) continue
    const draft = projectAppDraft(state, basenameOf(directory))
    entries.push({
      directory,
      name: draft.name,
      ...(draft.cardId === undefined ? {} : { cardId: draft.cardId }),
      ...(draft.description === undefined ? {} : { description: draft.description }),
      ...(state.identity?.iconUrl === undefined ? {} : { iconUrl: state.identity.iconUrl }),
      ...(state.linkedAppId === undefined ? {} : { linkedAppId: state.linkedAppId }),
      ...(state.link?.appName === undefined ? {} : { linkedAppName: state.link.appName }),
      state,
    })
  }
  return entries
}

function joinPath(parent: string, child: string): string {
  const separator = parent.includes('\\') ? '\\' : '/'
  return `${parent.replace(/[\\/]+$/u, '')}${separator}${child}`
}

function basenameOf(directory: string): string {
  return directory.replace(/[\\/]+$/u, '').split(/[\\/]/u).filter(Boolean).at(-1) ?? directory
}

/** One readable cause line. */
function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : String(cause)
}
