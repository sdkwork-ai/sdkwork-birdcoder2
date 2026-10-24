/**
 * Demand → project bootstrap: turn one demand from the hall into a workspace
 * and a starting session.
 *
 * The flow is the one the product already owns for New Session: pick a parent
 * directory through the Host browse capability, create the project directory,
 * register the Workspace, connect its session, and send the demand brief as the
 * session's first prompt. Only the directory name, the brief, and the
 * application-form spec reference are demand-specific.
 *
 * Nothing here talks to the SDKWork demand backend: the embedded demand hall
 * owns that transport and hands the selected demand over as plain data.
 */
import type { ISessions, IWorkspaces } from '@deepseek-ai/dsh-client-runtime/client'

/** Host session id, derived from the sessions service face. */
export type HostSessionId = Parameters<ISessions['open']>[0]

/** Host workspace id, derived from the workspaces service face. */
export type HostWorkspaceId = Parameters<IWorkspaces['connectWorkspace']>[0]

/** One demand handed over by the embedded demand hall. */
export interface DemandProjectInput {
  /** Demand id, stamped into the brief for traceability. */
  readonly id: string
  readonly title: string
  readonly description?: string
  /** Leaf category display name. */
  readonly category?: string
  /** Application-form code (`pc`, `h5`, ...), when the demand declares one. */
  readonly appForm?: string
  readonly budget?: string
  /** ISO instant from the demand's bid deadline. */
  readonly bidDeadline?: string
}

/** Outcome of one demand → project attempt. */
export type DemandProjectOutcome =
  | { readonly kind: 'started'; readonly workspacePath: string; readonly sessionTitle: string }
  | { readonly kind: 'cancelled' }

/**
 * The host services the bootstrap drives.
 *
 * Each member is the exact shape the flow consumes, so the real services
 * (`ctx.workspaces`, `ctx.sessions`) satisfy it structurally while a test can
 * provide a tiny stand-in.
 */
export interface DemandProjectServices {
  readonly workspaces: {
    /** Open the Host's directory picker; null when dismissed. */
    pickDirectory(): Promise<string | null>
    /** Create one child directory and return its absolute path. */
    createDirectory(path: string, name: string): Promise<string>
    /** Register an existing path as a Workspace. */
    create(input: { path: string }): Promise<{ workspaceId: HostWorkspaceId }>
    /** Connect a Workspace to its blank session. */
    connectWorkspace(workspaceId: HostWorkspaceId): Promise<HostSessionId>
    /** Rename a Workspace; failures are non-fatal for the bootstrap. */
    rename(workspaceId: HostWorkspaceId, title: string): Promise<unknown>
  }
  readonly sessions: {
    /** Select the new session as current. */
    open(id: HostSessionId): void
    /** Resolve the session face for the new session. */
    binding(id: HostSessionId): {
      readonly session: Pick<
        NonNullable<ReturnType<ISessions['binding']>>['session'],
        'prompt'
      >
    } | undefined
  }
}

/** Localized copy the brief is assembled from. */
export type DemandProjectTranslate = (key: string, params?: Record<string, string>) => string

/** One failed bootstrap, tagged with the step that failed. */
export class DemandProjectError extends Error {
  /**
   * @param phase - the bootstrap step that failed.
   * @param cause - the underlying failure.
   */
  constructor(readonly phase: 'directory' | 'workspace' | 'session' | 'prompt', cause: unknown) {
    super(`demand project bootstrap failed at ${phase}: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'DemandProjectError'
  }
}

/** Application-form code → the SDKWork spec that governs that delivery form. */
const APP_FORM_SPEC: Readonly<Record<string, string>> = {
  'pc': 'APP_PC_ARCHITECTURE_SPEC.md',
  'h5': 'APP_H5_ARCHITECTURE_SPEC.md',
  'static-web': 'APP_STATIC_WEB_ARCHITECTURE_SPEC.md',
  'miniprogram': 'MINI_PROGRAM_APP_ARCHITECTURE_SPEC.md',
  'flutter': 'FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md',
  'uniapp': 'UNIAPP_APP_ARCHITECTURE_SPEC.md',
  'android-native': 'ANDROID_APP_MOBILE_ARCHITECTURE_SPEC.md',
  'ios-native': 'IOS_APP_MOBILE_ARCHITECTURE_SPEC.md',
  'harmony-native': 'HARMONY_APP_MOBILE_ARCHITECTURE_SPEC.md',
  'unity': 'UNITY_APP_ARCHITECTURE_SPEC.md',
}

/**
 * Resolve the SDKWork specification for one application-form code.
 * @param appForm - application-form code from the demand.
 * @returns the spec file name, or undefined for an absent/unknown code.
 */
export function resolveAppFormSpec(appForm: string | undefined): string | undefined {
  return appForm === undefined ? undefined : APP_FORM_SPEC[appForm]
}

/**
 * Derive a portable project directory name from a demand title.
 *
 * ASCII letters, digits, `-` and `_` survive; every other run of characters
 * collapses to one `-`. A title with no ASCII content still yields a name,
 * because the demand id keeps the fallback unique.
 *
 * @param title - demand title.
 * @param demandId - demand id used when the title carries no ASCII content.
 * @returns a non-empty directory name (no path separators).
 */
export function demandProjectDirectoryName(title: string, demandId: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  if (ascii !== '') return ascii
  const suffix = demandId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return suffix === '' ? 'demand-project' : `demand-${suffix}`
}

/**
 * Assemble the session's first prompt from the demand.
 *
 * The brief is plain model-facing text: who asked for what, which application
 * form the delivery must take, and which SDKWork specification governs it.
 *
 * @param input - the demand handed over by the hall.
 * @param t - the `demand-hall` namespace translate seat.
 * @returns the prompt text.
 */
export function renderDemandBrief(input: DemandProjectInput, t: DemandProjectTranslate): string {
  const lines = [
    t('project.brief.heading', { title: input.title }),
    t('project.brief.demandId', { id: input.id }),
  ]
  if (input.category !== undefined && input.category !== '') {
    lines.push(t('project.brief.category', { category: input.category }))
  }
  const spec = resolveAppFormSpec(input.appForm)
  if (input.appForm !== undefined) {
    lines.push(t('project.brief.appForm', { appForm: input.appForm }))
  }
  if (spec !== undefined) {
    lines.push(t('project.brief.spec', { spec }))
  }
  if (input.budget !== undefined && input.budget !== '') {
    lines.push(t('project.brief.budget', { budget: input.budget }))
  }
  if (input.bidDeadline !== undefined && input.bidDeadline !== '') {
    lines.push(t('project.brief.deadline', { deadline: input.bidDeadline.slice(0, 10) }))
  }
  if (input.description !== undefined && input.description !== '') {
    lines.push(t('project.brief.detail', { description: input.description }))
  }
  lines.push(t('project.brief.instruction'))
  return lines.join('\n')
}

/** The prompt acceptance a session returns, structurally. */
export type DemandPromptOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly message: string } }

/**
 * Translate a rejected prompt admission into the bootstrap failure.
 * @param outcome - the prompt's remote result.
 * @returns the tagged failure, or undefined when the prompt was accepted.
 */
export function demandPromptFailure(outcome: DemandPromptOutcome): DemandProjectError | undefined {
  return outcome.ok ? undefined : new DemandProjectError('prompt', outcome.error.message)
}

/** The demand → project capability. */
export interface DemandProjectPort {
  /**
   * Create and initialize a project for one demand.
   * @param input - the selected demand.
   * @returns the created project, or cancellation when the directory pick was dismissed.
   */
  start(input: DemandProjectInput): Promise<DemandProjectOutcome>
}

/**
 * Wrap the bootstrap so a started project dismisses the surface that launched
 * it: opening the new session leaves the demand hall overlay covering the
 * session the user just created.
 * @param port - the bootstrap capability.
 * @param closeOverlay - closes the code-surface overlay hosting the hall.
 * @returns the wrapped capability.
 */
export function createDemandProjectLauncher(
  port: DemandProjectPort,
  closeOverlay: () => void,
): DemandProjectPort {
  return {
    async start(input) {
      const outcome = await port.start(input)
      if (outcome.kind === 'started') closeOverlay()
      return outcome
    },
  }
}

/** How many `name-N` suffixes to try before giving up on a directory collision. */
const MAX_DIRECTORY_ATTEMPTS = 5

/**
 * Build the demand → project port over the client's workspace and session
 * services.
 * @param services - the workspace and session faces the bootstrap drives.
 * @param t - the `demand-hall` namespace translate seat.
 * @returns the bootstrap capability.
 */
export function createDemandProjectPort(
  services: DemandProjectServices,
  t: DemandProjectTranslate,
): DemandProjectPort {
  return {
    async start(input) {
      const parent = await services.workspaces
        .pickDirectory()
        .catch((cause: unknown) => { throw new DemandProjectError('directory', cause) })
      if (parent === null || parent.trim() === '') return { kind: 'cancelled' }

      const baseName = demandProjectDirectoryName(input.title, input.id)
      let path: string | undefined
      for (let attempt = 0; attempt < MAX_DIRECTORY_ATTEMPTS && path === undefined; attempt += 1) {
        const name = attempt === 0 ? baseName : `${baseName}-${attempt + 1}`
        try {
          path = await services.workspaces.createDirectory(parent, name)
        } catch (cause) {
          // A same-named directory is the only expected collision; retry with a
          // numeric suffix. The last attempt's failure is the real error.
          if (attempt === MAX_DIRECTORY_ATTEMPTS - 1) throw new DemandProjectError('directory', cause)
        }
      }
      /* v8 ignore next -- the loop either resolves a path or throws on its last attempt. */
      if (path === undefined) throw new DemandProjectError('directory', 'no directory created')

      const workspace = await services.workspaces
        .create({ path })
        .catch((cause: unknown) => { throw new DemandProjectError('workspace', cause) })
      const sessionTitle = input.title.trim()
      if (sessionTitle !== '') {
        // A failed rename only costs the sidebar label; the project still works.
        await services.workspaces.rename(workspace.workspaceId, sessionTitle).catch(() => undefined)
      }
      const sessionId = await services.workspaces
        .connectWorkspace(workspace.workspaceId)
        .catch((cause: unknown) => { throw new DemandProjectError('session', cause) })
      services.sessions.open(sessionId)
      const binding = services.sessions.binding(sessionId)
      if (binding === undefined) throw new DemandProjectError('session', 'session binding unavailable')

      const text = renderDemandBrief(input, t)
      try {
        const accepted = await binding.session.prompt([{ type: 'text', text }], 'queue')
        const failure = demandPromptFailure(accepted)
        if (failure !== undefined) throw failure
      } catch (cause) {
        throw cause instanceof DemandProjectError ? cause : new DemandProjectError('prompt', cause)
      }
      return { kind: 'started', workspacePath: path, sessionTitle }
    },
  }
}
