/**
 * Project publish flow: the one state machine every publish entry point runs.
 *
 * Mounted by the session header (through the `deployPublish` service) and by
 * the workspace/session row menus, so both surfaces answer the same questions
 * the same way:
 *
 * 1. Read the project's `agent.app.config.json`.
 * 2. A recorded deploy_app that still resolves opens publish (or upload)
 *    directly — no app picker step.
 * 3. An unlinked project runs the create confirmation filled from the
 *    manifest, then continues into the requested surface.
 * 4. A recorded app that no longer resolves offers replacement creation and
 *    rewrites the linkage under the project's canonical deployment profile.
 *
 * Creation lands three facts: the app record, the manifest linkage, and the
 * platform target for the manifest's type card. A linkage write that fails
 * keeps the created app and retries only the write, so a retry can never
 * create a second app.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  CreateAppDialog,
  UploadSourceDialog,
  appKindOfCard,
  cardsOfAppKind,
  createDeployAppPublishingService,
  type DeployAppPublishingService,
} from '@sdkwork/deployments-pc-console-publishing'
import type { AppResponse } from '@sdkwork/deployments-app-sdk'
import { resolveProjectApp } from './deployAppFlow.ts'
import { deploymentsLocale, type DeployLocaleFace, type DeployPublishThemePort } from './deployPorts.ts'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import { createProjectApp } from './projectAppCreate.ts'
import {
  projectAppDraft,
  type ProjectAppDraft,
  type ProjectAppState,
} from './projectApp.ts'
import { DeployProjectAppDialog } from './DeployProjectAppDialog.tsx'
import { DeployPublishDialog } from './DeployPublishDialog.tsx'

/** What a created app is immediately used for. */
export type ProjectAppIntent = 'publish' | 'upload'

/** One transient outcome the flow reports to its owner for a banner. */
export interface ProjectAppFlowOutcome {
  readonly text: string
  readonly tone: 'success' | 'error'
}

/** The step the flow currently renders. */
type Step =
  | { readonly kind: 'resolving' }
  | {
    readonly kind: 'create'
    readonly state: ProjectAppState
    readonly draft: ProjectAppDraft
    /** Recorded id the app no longer resolves for; creation replaces it. */
    readonly replaceLinkedAppId?: string | undefined
    /** App already created; only its project linkage is missing. */
    readonly createdApp?: AppResponse | undefined
  }
  | { readonly kind: 'manual' }
  | { readonly kind: 'publish'; readonly app: AppResponse }
  | { readonly kind: 'upload'; readonly app: AppResponse }

/** Full props for the project publish flow. */
export interface DeployProjectAppFlowProps {
  /** Host adapter producing the deploy/drive clients and the manifest bridge. */
  readonly host: DeployHost
  /** Reactive theme port for the shared dialog surfaces. */
  readonly theme: DeployPublishThemePort
  /** Reactive locale face driving the console dialogs' locale mapping. */
  readonly locale: DeployLocaleFace
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Project directory to read and write; omitted reads the session cwd. */
  readonly directory?: string | undefined
  /** Surface to open once the app exists; defaults to publish. */
  readonly intent?: ProjectAppIntent | undefined
  /** Report one outcome to the owner for its banner. */
  readonly onDone?: ((outcome: ProjectAppFlowOutcome) => void) | undefined
  /** Close the flow without another side effect. */
  readonly onClose: () => void
}

/**
 * Render the project publish flow for the current step.
 * @param props - the host adapter, theme/locale ports, the target directory,
 *   the requested surface, and the completion/close callbacks.
 * @returns the active dialog, or null while resolving or without clients.
 */
export function DeployProjectAppFlow({
  host, theme, locale: localeFace, t, directory, intent = 'publish', onDone, onClose,
}: DeployProjectAppFlowProps) {
  const [clients, setClients] = useState<DeployHostClients | undefined>(() => {
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  })
  const [step, setStep] = useState<Step>({ kind: 'resolving' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  // uSES calls both members unbound: bind the ports through stable closures
  // instead of handing the port's own methods through.
  const subscribeTheme = useCallback((listener: () => void) => theme.subscribe(listener), [theme])
  const readTheme = useCallback(() => theme.getColorScheme(), [theme])
  const subscribeLocale = useCallback((listener: () => void) => localeFace.subscribe(listener), [localeFace])
  const readLocale = useCallback(() => localeFace.getSnapshot(), [localeFace])
  const colorScheme = useSyncExternalStore(subscribeTheme, readTheme, readTheme)
  const localeSnapshot = useSyncExternalStore(subscribeLocale, readLocale, readLocale)
  const locale = useMemo(() => deploymentsLocale(localeSnapshot.active), [localeSnapshot.active])
  const publishingService: DeployAppPublishingService | undefined = useMemo(
    () =>
      clients === undefined
        ? undefined
        : createDeployAppPublishingService({
          deployClient: clients.deployClient,
          driveClient: clients.driveClient,
        }),
    [clients],
  )

  // Rebuild clients on host notifications (IAM hydration, token rotation,
  // environment switch), the same self-heal the picker and template flows use.
  useEffect(() => {
    return host.subscribe(() => {
      try {
        setClients(host.readClients())
      } catch {
        setClients(undefined)
      }
    })
  }, [host])

  /** Resolve the project once, then land on the surface its state supports. */
  useEffect(() => {
    if (clients === undefined) return
    const alive = { value: true }
    const isAlive = (): boolean => alive.value
    void host.readProjectApp(directory ?? undefined).then(async (state) => {
      if (!isAlive()) return
      const resolution = await resolveProjectApp(
        () => Promise.resolve(state),
        appId => clients.deployClient.app.retrieve(appId),
      )
      if (!isAlive()) return
      if (resolution.status === 'linked') {
        setStep(intent === 'upload'
          ? { kind: 'upload', app: resolution.app }
          : { kind: 'publish', app: resolution.app })
        return
      }
      const draft = projectAppDraft(state, fallbackName(state.directory ?? directory, t('create.untitled')))
      setStep({
        kind: 'create',
        state,
        draft,
        ...(resolution.status === 'stale' && state.linkedAppId !== undefined
          ? { replaceLinkedAppId: state.linkedAppId }
          : {}),
      })
    })
    return () => { alive.value = false }
  }, [clients, host, directory, intent, t])

  /** Replace the current step with the requested surface for a created app. */
  const continueWith = useCallback((app: AppResponse): void => {
    setError(undefined)
    setStep(intent === 'upload' ? { kind: 'upload', app } : { kind: 'publish', app })
  }, [intent])

  /**
   * Register the platform target for a created app. A surface card is either
   * the manifest draft's or the single card its app kind reverses to; an
   * ambiguous app kind has no target to register and counts as complete.
   */
  const ensureTarget = useCallback(async (app: AppResponse, cardId: string | undefined): Promise<boolean> => {
    const cards = cardsOfAppKind(app.appKind)
    const card = cardId ?? (cards.length === 1 ? cards[0]?.id : undefined)
    if (card === undefined || publishingService === undefined) return true
    try {
      await publishingService.createPlatformTargetForCard(app.id, card)
      return true
    } catch {
      // The app exists and is linked; only its surface target is missing, so
      // the caller reports it and keeps the flow usable.
      return false
    }
  }, [publishingService])

  /** Create the app from the manifest draft; retry only the linkage when it failed. */
  const confirmCreate = useCallback(async (current: Extract<Step, { kind: 'create' }>): Promise<void> => {
    if (publishingService === undefined || clients === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      // A created app whose linkage write failed: never create again, just
      // rewrite the manifest entry and finish the target registration.
      if (current.createdApp !== undefined) {
        const linked = await host.writeDeployLink({
          appId: current.createdApp.id,
          appName: current.createdApp.name,
          appSlug: current.createdApp.slug,
          ...(current.state.directory === undefined ? {} : { sourceDirectory: current.state.directory }),
        }, current.state.directory, {
          name: current.createdApp.name,
          displayName: current.draft.name,
          ...(current.draft.description === undefined ? {} : { description: current.draft.description }),
          ...(current.draft.appKey === undefined ? {} : { appKey: current.draft.appKey }),
          appSlug: current.createdApp.slug,
          ...(current.draft.cardId === undefined ? {} : { cardId: current.draft.cardId }),
          appKind: current.createdApp.appKind,
        })
        if (!linked) {
          setError(t('create.linkFailed'))
          return
        }
        const targetCreated = await ensureTarget(current.createdApp, current.draft.cardId)
        onDone?.(targetCreated
          ? { text: t('notice.linked', { name: current.createdApp.name }), tone: 'success' }
          : { text: t('create.targetFailed', { name: current.createdApp.name }), tone: 'error' })
        continueWith(current.createdApp)
        return
      }
      // Re-read immediately before creating: another window may have linked
      // the project since the flow opened, and creation must refuse rather
      // than duplicate the app.
      const fresh = await host.readProjectApp(directory ?? undefined)
      const outcome = await createProjectApp({
        createRecord: async (input) => {
          const appKind = input.cardId === undefined ? undefined : appKindOfCard(input.cardId)
          if (appKind === undefined) {
            throw new Error(`ui-sdkwork-deploy: no app kind is registered for card "${input.cardId ?? ''}"`)
          }
          return publishingService.createAppRecord({
            name: input.name,
            appKind,
            ...(input.description === undefined ? {} : { description: input.description }),
          })
        },
        createTarget: async (appId, cardId) => {
          await publishingService.createPlatformTargetForCard(appId, cardId)
        },
        writeLink: (patch, app) => host.writeDeployLink(patch, current.state.directory, {
          name: app.name,
          displayName: current.draft.name,
          ...(current.draft.description === undefined ? {} : { description: current.draft.description }),
          ...(current.draft.appKey === undefined ? {} : { appKey: current.draft.appKey }),
          appSlug: app.slug,
          ...(current.draft.cardId === undefined ? {} : { cardId: current.draft.cardId }),
          appKind: app.appKind,
        }),
      }, {
        state: fresh,
        draft: current.draft,
        ...(current.replaceLinkedAppId === undefined ? {} : { replaceLinkedAppId: current.replaceLinkedAppId }),
      })
      if (outcome.status === 'already-linked') {
        onDone?.({ text: t('create.alreadyLinked'), tone: 'error' })
        onClose()
        return
      }
      if (!outcome.linked) {
        // Keep the created app on screen and offer the linkage retry: the
        // manifest write is the only missing fact, and a second create would
        // duplicate the app.
        setStep({ ...current, createdApp: outcome.app })
        setError(t('create.linkFailed'))
        return
      }
      onDone?.(
        outcome.targetCreated
          ? { text: t('notice.created', { name: outcome.app.name }), tone: 'success' }
          : { text: t('create.targetFailed', { name: outcome.app.name }), tone: 'error' },
      )
      continueWith(outcome.app)
    } catch (cause) {
      setError(t('create.failed', { message: messageOf(cause) }))
    } finally {
      setBusy(false)
    }
  }, [clients, continueWith, directory, ensureTarget, host, onClose, onDone, publishingService, t])

  /** Record a manually created app, then continue into the requested surface. */
  const createdManually = useCallback((app: AppResponse): void => {
    setError(undefined)
    void host.writeDeployLink({
      appId: app.id,
      appName: app.name,
      appSlug: app.slug,
      ...(host.readDefaultDirectory() === undefined ? {} : { sourceDirectory: host.readDefaultDirectory() }),
    }, directory, {
      name: app.name,
      appSlug: app.slug,
      appKind: app.appKind,
      ...(singleCardOfKind(app.appKind) === undefined ? {} : { cardId: singleCardOfKind(app.appKind) }),
    }).then(async (linked) => {
      if (!linked) {
        setStep({ kind: 'create', state: { hasManifest: false }, draft: { name: app.name }, createdApp: app })
        setError(t('create.linkFailed'))
        return
      }
      const targetCreated = await ensureTarget(app, undefined)
      onDone?.(targetCreated
        ? { text: t('notice.created', { name: app.name }), tone: 'success' }
        : { text: t('create.targetFailed', { name: app.name }), tone: 'error' })
      continueWith(app)
    })
  }, [continueWith, directory, ensureTarget, host, onDone, t])

  if (clients === undefined || publishingService === undefined) return null

  if (step.kind === 'resolving') return null

  if (step.kind === 'create') {
    return (
      <DeployProjectAppDialog
        draft={step.draft}
        hasManifest={step.state.hasManifest}
        stale={step.replaceLinkedAppId !== undefined}
        intent={intent}
        busy={busy}
        error={error}
        retryingLink={step.createdApp !== undefined}
        theme={colorScheme}
        t={t}
        onConfirm={() => { void confirmCreate(step) }}
        onManual={() => {
          setError(undefined)
          setStep({ kind: 'manual' })
        }}
        onClose={onClose}
      />
    )
  }

  if (step.kind === 'manual') {
    return (
      <CreateAppDialog
        deployClient={clients.deployClient}
        driveClient={clients.driveClient}
        locale={locale}
        theme={colorScheme}
        onCreated={createdManually}
        onClose={onClose}
      />
    )
  }

  if (step.kind === 'upload') {
    return (
      <UploadSourceDialog
        deployClient={clients.deployClient}
        driveClient={clients.driveClient}
        locale={locale}
        app={step.app}
        theme={colorScheme}
        onUploaded={(summary) => {
          onDone?.({ text: t('notice.uploaded', { summary }), tone: 'success' })
          onClose()
        }}
        onClose={onClose}
      />
    )
  }

  return (
    <DeployPublishDialog
      host={host}
      theme={theme}
      locale={localeFace}
      app={step.app}
      defaultDirectory={host.readDefaultDirectory()}
      onPublished={() => {
        onDone?.({ text: t('notice.published'), tone: 'success' })
        onClose()
      }}
      onClose={onClose}
    />
  )
}

/** Last path segment of a project directory. */
function fallbackName(directory: string | undefined, unnamed: string): string {
  const segment = directory?.split(/[\\/]/u).filter(Boolean).at(-1)
  return segment === undefined || segment === '' ? unnamed : segment
}

/** The one type card an app kind reverses to, or undefined when ambiguous. */
function singleCardOfKind(appKind: AppResponse['appKind']): string | undefined {
  const cards = cardsOfAppKind(appKind)
  return cards.length === 1 ? cards[0]?.id : undefined
}

/** One-line cause text for localized failure copy. */
function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : String(cause)
}
