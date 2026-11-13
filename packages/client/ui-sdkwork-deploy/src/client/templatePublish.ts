/**
 * Publish-as-template planning and execution for app development scaffolds.
 *
 * One run starts from the app roots discovered under a project's `apps/`
 * directory, maps each to the current account's platform app, and then:
 *
 * 1. registers the platform app when the account has none (matched by the
 *    manifest's linkage first, then by slug/name — a repeat run reuses the
 *    record instead of creating a duplicate);
 * 2. packs the app root through the Host bridge (`.gitignore`-aware, sensitive
 *    files excluded) and uploads the archive as the template version's
 *    artifact;
 * 3. creates the template listing, or — when the same account already owns a
 *    template for that platform app and key — updates the listing and appends
 *    a new version, so a repeat publish never creates a duplicate listing;
 * 4. optionally submits the listing for review; and
 * 5. records the app and template identities in the app's own
 *    `agent.app.config.json` for the next run's dedupe.
 *
 * Every side effect arrives through {@link TemplatePublishPorts}, so this
 * module is plain data and tests drive the whole state machine with stubs.
 */
import { appKeyOf } from './appManifestCompose.ts'
import type { TemplateAppCandidate } from './templateApps.ts'
import type { TemplateAppArchive } from './hostArchive.ts'

/** One platform app the current account may reach. */
export interface OwnedPlatformApp {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly appKind: string
}

/** One template listing owned by the current account. */
export interface OwnedTemplate {
  readonly id: string
  readonly appUuid: string
  readonly templateKey: string
  readonly displayName: string
  readonly summary?: string
  readonly description?: string
  readonly iconMediaRef?: string
  readonly coverMediaRef?: string
  readonly screenshots?: readonly TemplateScreenshotValue[]
  /**
   * Latest semantic version (`deploy_app_template_version.template_version`),
   * when the caller resolved it. The listing row's own `version` is an
   * optimistic-lock counter and must never be used as a version number.
   */
  readonly latestVersion?: string
  readonly status: string
  readonly latestVersionUuid?: string
}

/** One persisted marketplace sample page. */
export interface TemplateScreenshotValue {
  readonly mediaRef: string
  readonly caption?: string
  readonly sortOrder: number
}

/** Locally selected files uploaded during publish, after the platform app exists. */
export interface TemplateMediaDraft {
  readonly icon?: File
  readonly cover?: File
  readonly screenshots?: readonly File[]
}

/** The account-scoped publish settings shared by every selected app. */
export interface TemplatePublishSettings {
  readonly categoryUuid: string
  readonly visibility: 'PRIVATE' | 'PUBLIC'
  /** Submit every created/updated listing for marketplace review. */
  readonly submitForReview: boolean
}

/** Per-app editable fields the plan initializes and the user may override. */
export interface TemplateAppValues {
  readonly displayName: string
  readonly templateKey: string
  readonly summary: string
  readonly description: string
  readonly version: string
  readonly changelog: string
  readonly iconMediaRef?: string
  readonly coverMediaRef?: string
  readonly screenshots: readonly TemplateScreenshotValue[]
}

/** How one selected app will be published. */
export interface TemplatePublishPlan {
  readonly candidate: TemplateAppCandidate
  /** Platform app the run will publish under (absent → create it). */
  readonly platformApp?: OwnedPlatformApp
  /** Existing listing to update (absent → create it). */
  readonly template?: OwnedTemplate
  /** The key cannot be used because another platform app owns it. */
  readonly conflict?: string
  /** The manifest-derived values shown before editing. */
  readonly values: TemplateAppValues
}

/** Build one plan for every candidate. */
export function planTemplatePublications(
  candidates: readonly TemplateAppCandidate[],
  ownedApps: readonly OwnedPlatformApp[],
  ownedTemplates: readonly OwnedTemplate[],
): readonly TemplatePublishPlan[] {
  // Two discovered roots may not claim one template key: publishing both
  // would append every run's version to a single listing. The account's own
  // listings are deduped by key below instead.
  const keyOwners = new Map<string, number>()
  for (const candidate of candidates) {
    keyOwners.set(candidate.appKey, (keyOwners.get(candidate.appKey) ?? 0) + 1)
  }
  return candidates.map((candidate) => {
    const platformApp = matchPlatformApp(candidate, ownedApps)
    const byManifestId = candidate.linkedTemplateId === undefined
      ? undefined
      : ownedTemplates.find(template => template.id === candidate.linkedTemplateId)
    const byKey = ownedTemplates.find(template => template.templateKey === candidate.appKey)
    const template = byManifestId ?? byKey
    const conflict = (keyOwners.get(candidate.appKey) ?? 0) > 1
      ? `more than one selected app uses the template key "${candidate.appKey}"`
      : undefined
    const values: TemplateAppValues = {
      displayName: template?.displayName ?? candidate.name,
      templateKey: template?.templateKey ?? candidate.appKey,
      summary: template?.summary ?? candidate.description ?? '',
      description: template?.description ?? candidate.description ?? '',
      version: nextTemplateVersion(template?.latestVersion ?? candidate.linkedTemplateVersion),
      changelog: '',
      ...(template?.iconMediaRef === undefined ? {} : { iconMediaRef: template.iconMediaRef }),
      ...(template?.coverMediaRef === undefined ? {} : { coverMediaRef: template.coverMediaRef }),
      screenshots: template?.screenshots ?? [],
    }
    return {
      candidate,
      ...(platformApp === undefined ? {} : { platformApp }),
      ...(template === undefined ? {} : { template }),
      ...(conflict === undefined ? {} : { conflict }),
      values,
    }
  })
}

/**
 * Match a discovered app root to one of the account's platform apps:
 * the manifest linkage first, then the governed key against the app slug or
 * name, then the display name. Every comparison is case-insensitive so a
 * manifest key and a server-derived slug agree.
 * @param candidate - the discovered app root.
 * @param ownedApps - the account's reachable platform apps.
 * @returns the matching record, or undefined when none exists yet.
 */
export function matchPlatformApp(
  candidate: TemplateAppCandidate,
  ownedApps: readonly OwnedPlatformApp[],
): OwnedPlatformApp | undefined {
  const linked = candidate.linkedAppId === undefined
    ? undefined
    : ownedApps.find(app => app.id === candidate.linkedAppId)
  if (linked !== undefined) return linked
  const key = normalizeKey(candidate.appKey)
  const byKey = ownedApps.find(app =>
    normalizeKey(app.slug) === key || normalizeKey(app.name) === key)
  if (byKey !== undefined) return byKey
  const byName = ownedApps.find(app =>
    normalizeKey(app.name) === normalizeKey(candidate.name))
  return byName
}

/**
 * Next semantic version after the current listing version.
 * @param current - the listing's latest version, or undefined for a new listing.
 * @returns the bumped patch version, or `0.1.0` when nothing parseable exists.
 */
export function nextTemplateVersion(current: string | undefined): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(current?.trim() ?? '')
  if (match === null) return '0.1.0'
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  return `${major}.${minor}.${patch + 1}`
}

/** One stage of a publish run, for the row's live status. */
export type TemplatePublishStage =
  | { readonly kind: 'registering' }
  | { readonly kind: 'uploadingMedia'; readonly completed: number; readonly total: number }
  | { readonly kind: 'packing'; readonly read: number; readonly total: number }
  | { readonly kind: 'compressed'; readonly files: number; readonly bytes: number }
  | { readonly kind: 'uploading'; readonly percent: number }
  | { readonly kind: 'saving' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'linking' }

/** Facts of one completed app publish. */
export interface TemplatePublishOutcome {
  readonly candidate: TemplateAppCandidate
  readonly platformAppId: string
  readonly templateId: string
  readonly templateKey: string
  readonly displayName: string
  readonly version: string
  readonly createdApp: boolean
  readonly createdTemplate: boolean
  readonly submitted: boolean
  readonly fileCount: number
  readonly totalBytes: number
  readonly archiveBytes: number
  readonly linkWritten: boolean
  readonly warnings: readonly string[]
}

/** Input for one app publish. */
export interface TemplatePublishRequest {
  readonly plan: TemplatePublishPlan
  readonly values: TemplateAppValues
  readonly settings: TemplatePublishSettings
  readonly media?: TemplateMediaDraft | undefined
  readonly onStage?: ((stage: TemplatePublishStage) => void) | undefined
}

/** Everything one publish run needs from the host and the SDK clients. */
export interface TemplatePublishPorts {
  /** The account's reachable platform apps (fresh read at execute time). */
  listPlatformApps(): Promise<readonly OwnedPlatformApp[]>
  /** Register one platform app owned by the current account. */
  createPlatformApp(input: {
    readonly name: string
    readonly slug: string
    readonly appKind: string
    readonly description?: string
  }): Promise<OwnedPlatformApp>
  /** Register the app's surface target; optional/best-effort. */
  createPlatformTarget(appId: string, cardId: string): Promise<void>
  /** Upload one selected image and return its persistent Drive media reference. */
  uploadMedia(input: { readonly file: File; readonly appId: string }): Promise<string>
  /** The account's template listings (fresh read before create). */
  listTemplates(): Promise<readonly OwnedTemplate[]>
  createTemplate(input: CreateTemplateListingInput): Promise<OwnedTemplate>
  updateTemplate(templateId: string, input: UpdateTemplateListingInput): Promise<OwnedTemplate>
  createVersion(templateId: string, input: CreateTemplateVersionInput): Promise<void>
  submitTemplate(templateId: string): Promise<void>
  /** Pack one app root through the Host bridge. */
  packApp(directory: string, stage: (read: number, total: number) => void): Promise<TemplateAppArchive>
  /** Upload the packed archive as a platform artifact. */
  uploadArchive(input: {
    readonly appId: string
    readonly file: Blob
    readonly fileName: string
    readonly checksumSha256: string
    readonly onProgress: (percent: number) => void
  }): Promise<{ readonly artifactId: string }>
  /** Merge the app + template identities into the app manifest. */
  writeAppLink(
    directory: string,
    patch: {
      readonly appId: string
      readonly appName: string
      readonly appSlug: string
      readonly appKey: string
      readonly templateId: string
      readonly templateKey: string
      readonly templateName: string
      readonly templateVersion?: string
      readonly sourceDirectory: string
    },
  ): Promise<boolean>
}

/** Create-listing input (already mapped from the plan and settings). */
export interface CreateTemplateListingInput {
  readonly appUuid: string
  readonly categoryUuid: string
  readonly templateKey: string
  readonly displayName: string
  readonly summary: string
  readonly description: string
  readonly iconMediaRef?: string
  readonly coverMediaRef?: string
  readonly screenshots: readonly TemplateScreenshotValue[]
  readonly visibility: 'PRIVATE' | 'PUBLIC'
  readonly version: string
  readonly changelog: string
  readonly artifactUuid: string
  readonly checksumSha256: string
  readonly packageSizeBytes: number
  readonly platformTargets: readonly string[]
}

/** Update-listing input (metadata only; versions are separate). */
export interface UpdateTemplateListingInput {
  readonly displayName: string
  readonly summary: string
  readonly description: string
  readonly iconMediaRef?: string
  readonly coverMediaRef?: string
  readonly screenshots: readonly TemplateScreenshotValue[]
  readonly visibility: 'PRIVATE' | 'PUBLIC'
  readonly categoryUuid: string
}

/** Create-version input. */
export interface CreateTemplateVersionInput {
  readonly version: string
  readonly changelog: string
  readonly artifactUuid: string
  readonly checksumSha256: string
  readonly packageSizeBytes: number
  readonly platformTargets: readonly string[]
}

/** The discovered app has no platform kind, so no app record can be created. */
export class TemplateAppKindMissingError extends Error {
  constructor(name: string) {
    super(`template publish: the manifest of "${name}" determines no platform app kind`)
    this.name = 'TemplateAppKindMissingError'
  }
}

/**
 * Upload the author's selected images once the platform app exists (Drive
 * anchors media to that app). Existing references survive when no replacement
 * file was chosen; selecting screenshots replaces the persisted set.
 */
async function uploadSelectedMedia(
  ports: TemplatePublishPorts,
  appId: string,
  media: TemplateMediaDraft | undefined,
  values: TemplateAppValues,
  onStage: ((stage: TemplatePublishStage) => void) | undefined,
): Promise<Pick<TemplateAppValues, 'iconMediaRef' | 'coverMediaRef' | 'screenshots'>> {
  const screenshots = media?.screenshots
  const hasDraft = media?.icon !== undefined || media?.cover !== undefined || screenshots !== undefined
  const total = (media?.icon === undefined ? 0 : 1)
    + (media?.cover === undefined ? 0 : 1)
    + (screenshots?.length ?? 0)
  if (!hasDraft) {
    return {
      ...(values.iconMediaRef === undefined ? {} : { iconMediaRef: values.iconMediaRef }),
      ...(values.coverMediaRef === undefined ? {} : { coverMediaRef: values.coverMediaRef }),
      screenshots: values.screenshots,
    }
  }
  if (total === 0) {
    return {
      ...(values.iconMediaRef === undefined ? {} : { iconMediaRef: values.iconMediaRef }),
      ...(values.coverMediaRef === undefined ? {} : { coverMediaRef: values.coverMediaRef }),
      screenshots: [],
    }
  }
  let completed = 0
  const report = (): void => {
    onStage?.({ kind: 'uploadingMedia', completed, total })
  }
  report()
  const upload = async (file: File): Promise<string> => {
    const mediaRef = await ports.uploadMedia({ file, appId })
    completed += 1
    report()
    return mediaRef
  }
  const iconMediaRef = media?.icon === undefined
    ? values.iconMediaRef
    : await upload(media.icon)
  const coverMediaRef = media?.cover === undefined
    ? values.coverMediaRef
    : await upload(media.cover)
  const uploadedScreenshots: TemplateScreenshotValue[] = []
  for (const [index, file] of (screenshots ?? []).entries()) {
    uploadedScreenshots.push({ mediaRef: await upload(file), sortOrder: index })
  }
  return {
    ...(iconMediaRef === undefined ? {} : { iconMediaRef }),
    ...(coverMediaRef === undefined ? {} : { coverMediaRef }),
    screenshots: screenshots === undefined ? values.screenshots : uploadedScreenshots,
  }
}

/**
 * Publish one planned app as a template.
 * @param ports - platform app/template/upload/manifest side effects.
 * @param request - the plan, the (possibly edited) values, and settings.
 * @returns the created/updated template identity and packaging facts.
 * @throws when the platform app cannot be registered, the archive fails, or a
 *   template write is refused; the caller isolates one row's failure.
 */
export async function publishTemplateApp(
  ports: TemplatePublishPorts,
  request: TemplatePublishRequest,
): Promise<TemplatePublishOutcome> {
  const { plan, values, settings, media, onStage } = request
  const warnings: string[] = []
  let platformApp = plan.platformApp
  let createdApp = false
  if (platformApp === undefined) {
    onStage?.({ kind: 'registering' })
    // Re-read immediately before creating: a concurrent publish may have
    // registered the app since the plan was built.
    const fresh = await ports.listPlatformApps()
    platformApp = matchPlatformApp(plan.candidate, fresh)
    if (platformApp === undefined) {
      const appKind = platformAppKind(plan.candidate)
      if (appKind === undefined) throw new TemplateAppKindMissingError(plan.candidate.name)
      try {
        platformApp = await ports.createPlatformApp({
          name: plan.candidate.name,
          slug: platformAppSlug(plan.candidate),
          appKind,
          ...(plan.candidate.description === undefined ? {} : { description: plan.candidate.description }),
        })
        createdApp = true
      } catch (cause: unknown) {
        // A concurrent publish may have won the slug race between the list
        // and the create; adopt that record instead of failing the row.
        const raced = matchPlatformApp(plan.candidate, await ports.listPlatformApps())
        if (raced === undefined) throw cause
        platformApp = raced
      }
      if (plan.candidate.cardId !== undefined) {
        try {
          await ports.createPlatformTarget(platformApp.id, plan.candidate.cardId)
        } catch {
          warnings.push(`the platform target for card "${plan.candidate.cardId}" was not registered`)
        }
      }
    }
  }
  const platformAppId = platformApp.id

  // Link the app before the network-heavy packaging so a failed publish still
  // leaves the project able to dedupe on its next run. A custom directory with
  // no manifest is intentionally left untouched: publishing a template must
  // not fabricate an app manifest in a directory the operator only picked as a
  // source.
  const baseLink = {
    appId: platformApp.id,
    appName: platformApp.name,
    appSlug: platformApp.slug,
    appKey: plan.candidate.appKey,
    sourceDirectory: plan.candidate.directory,
  } as const
  const hasManifest = plan.candidate.manifestRaw.trim() !== ''
  const linkedApp = hasManifest && await ports.writeAppLink(plan.candidate.directory, {
    ...baseLink,
    templateId: plan.template?.id ?? '',
    templateKey: values.templateKey,
    templateName: values.displayName,
  }).catch(() => false)
  // A missing manifest is already explained in the custom-directory step; do
  // not duplicate it as an English warning in the result ledger.
  if (hasManifest && !linkedApp) warnings.push('writing the app linkage to agent.app.config.json failed')

  const uploadedMedia = await uploadSelectedMedia(ports, platformAppId, media, values, onStage)
  const effectiveValues: TemplateAppValues = { ...values, ...uploadedMedia }

  onStage?.({ kind: 'packing', read: 0, total: 0 })
  const archive = await ports.packApp(plan.candidate.directory, (read, total) => {
    onStage?.({ kind: 'packing', read, total })
  })
  // The archive is a local zip built by the browser-side fflate packer; this
  // stage makes the transition from local compression to network upload
  // visible before the first upload byte moves.
  onStage?.({ kind: 'compressed', files: archive.fileCount, bytes: archive.archive.size })
  const fileName = `${effectiveValues.templateKey}-${effectiveValues.version}.zip`
  onStage?.({ kind: 'uploading', percent: 0 })
  const uploaded = await ports.uploadArchive({
    appId: platformAppId,
    file: archive.archive,
    fileName,
    checksumSha256: archive.checksumSha256,
    onProgress: (percent) => { onStage?.({ kind: 'uploading', percent }) },
  })

  onStage?.({ kind: 'saving' })
  const versionInput: CreateTemplateVersionInput = {
    version: effectiveValues.version,
    changelog: effectiveValues.changelog,
    artifactUuid: uploaded.artifactId,
    checksumSha256: archive.checksumSha256,
    packageSizeBytes: archive.totalBytes,
    platformTargets: plan.candidate.platforms,
  }
  let template = plan.template
  if (template === undefined) {
    // A concurrent run may have created the listing after the plan was built.
    const fresh = await ports.listTemplates()
    template = fresh.find(entry => entry.templateKey === effectiveValues.templateKey)
  }
  let createdTemplate = false
  if (template === undefined) {
    template = await ports.createTemplate({
      appUuid: platformAppId,
      categoryUuid: settings.categoryUuid,
      templateKey: effectiveValues.templateKey,
      displayName: effectiveValues.displayName,
      summary: effectiveValues.summary,
      description: effectiveValues.description,
      ...(effectiveValues.iconMediaRef === undefined ? {} : { iconMediaRef: effectiveValues.iconMediaRef }),
      ...(effectiveValues.coverMediaRef === undefined ? {} : { coverMediaRef: effectiveValues.coverMediaRef }),
      screenshots: effectiveValues.screenshots,
      visibility: settings.visibility,
      version: effectiveValues.version,
      changelog: effectiveValues.changelog,
      artifactUuid: uploaded.artifactId,
      checksumSha256: archive.checksumSha256,
      packageSizeBytes: archive.totalBytes,
      platformTargets: plan.candidate.platforms,
    })
    createdTemplate = true
  } else {
    try {
      await ports.updateTemplate(template.id, {
        displayName: effectiveValues.displayName,
        summary: effectiveValues.summary,
        description: effectiveValues.description,
        ...(effectiveValues.iconMediaRef === undefined ? {} : { iconMediaRef: effectiveValues.iconMediaRef }),
        ...(effectiveValues.coverMediaRef === undefined ? {} : { coverMediaRef: effectiveValues.coverMediaRef }),
        screenshots: effectiveValues.screenshots,
        visibility: settings.visibility,
        categoryUuid: settings.categoryUuid,
      })
    } catch {
      warnings.push('updating the template listing metadata was refused; the new version was still created')
    }
    await ports.createVersion(template.id, versionInput)
  }
  let submitted = false
  if (settings.submitForReview) {
    onStage?.({ kind: 'submitting' })
    try {
      await ports.submitTemplate(template.id)
      submitted = true
    } catch {
      warnings.push('the template was saved but its review submission failed')
    }
  }
  onStage?.({ kind: 'linking' })
  const linkedTemplate = hasManifest && await ports.writeAppLink(plan.candidate.directory, {
    ...baseLink,
    templateId: template.id,
    templateKey: template.templateKey,
    templateName: effectiveValues.displayName,
    templateVersion: effectiveValues.version,
  }).catch(() => false)
  if (hasManifest && !linkedTemplate) {
    warnings.push('writing the template identity to agent.app.config.json failed')
  }

  return {
    candidate: plan.candidate,
    platformAppId,
    templateId: template.id,
    templateKey: template.templateKey,
    displayName: effectiveValues.displayName,
    version: effectiveValues.version,
    createdApp,
    createdTemplate,
    submitted,
    fileCount: archive.fileCount,
    totalBytes: archive.totalBytes,
    archiveBytes: archive.archive.size,
    linkWritten: linkedApp && linkedTemplate,
    warnings,
  }
}

/**
 * The platform app kind one candidate can be registered as.
 *
 * The console's card vocabulary is the first choice. A manifest that
 * determines no single card (a Flutter or multi-mobile root) still declares
 * template platforms; the first concrete mobile/desktop platform picks a
 * usable app kind so the source can be published and deduped by the account.
 * Only a manifest with neither a card nor a platform stays unregistrable.
 * @param candidate - the discovered app root.
 * @returns the `deploy_app.app_kind` value, or undefined when nothing is known.
 */
export function platformAppKind(candidate: TemplateAppCandidate): string | undefined {
  switch (candidate.cardId) {
    case 'h5': return 'SPA_WEB'
    case 'pc-web': return 'SPA_WEB'
    case 'desktop': return 'DESKTOP_APP'
    case 'mini-program': return 'WECHAT_MINIPROGRAM'
    case 'android': return 'ANDROID_APP'
    case 'ios': return 'IOS_APP'
    case 'harmonyos': return 'HARMONYOS_APP'
    case 'api-service': return 'API_SERVICE'
    case 'static-web': return 'STATIC_WEB'
    default: break
  }
  const platforms = candidate.platforms
  if (platforms.includes('ANDROID')) return 'ANDROID_APP'
  if (platforms.includes('IOS')) return 'IOS_APP'
  if (platforms.includes('HARMONY')) return 'HARMONYOS_APP'
  if (platforms.includes('MINIPROGRAM')) return 'WECHAT_MINIPROGRAM'
  if (platforms.includes('DESKTOP')) return 'DESKTOP_APP'
  if (platforms.includes('PC') || platforms.includes('H5') || platforms.includes('STATIC_WEB')) return 'SPA_WEB'
  return undefined
}

/** Kebab slug for a new platform app (the governed key already is one). */
function platformAppSlug(candidate: TemplateAppCandidate): string {
  return appKeyOf({ name: candidate.name, appKey: candidate.appKey })
}

/** Normalize one name/key for matching. */
function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}
