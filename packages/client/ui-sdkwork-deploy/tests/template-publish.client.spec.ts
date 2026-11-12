/** Dedupe planning and the publish state machine over stub ports. */
import { describe, expect, it } from 'vitest'
import {
  matchPlatformApp,
  nextTemplateVersion,
  planTemplatePublications,
  platformAppKind,
  publishTemplateApp,
  TemplateAppKindMissingError,
  type OwnedPlatformApp,
  type OwnedTemplate,
  type TemplateAppValues,
  type TemplatePublishPorts,
} from '../src/client/templatePublish.ts'
import type { TemplateAppCandidate } from '../src/client/templateApps.ts'
import type { TemplateAppArchive } from '../src/client/hostArchive.ts'

function candidate(overrides: Partial<TemplateAppCandidate> = {}): TemplateAppCandidate {
  return {
    directory: '/proj/apps/sdkwork-demo-h5',
    directoryName: 'sdkwork-demo-h5',
    appKey: 'sdkwork-demo-h5',
    name: '演示 H5',
    description: 'Mobile web app',
    cardId: 'h5',
    version: '1.2.3',
    platforms: ['H5'],
    manifestRaw: '{}',
    projectRoot: false,
    ...overrides,
  }
}

function ownedApp(overrides: Partial<OwnedPlatformApp> = {}): OwnedPlatformApp {
  return { id: 'app-1', name: '演示 H5', slug: 'sdkwork-demo-h5', appKind: 'SPA_WEB', ...overrides }
}

function ownedTemplate(overrides: Partial<OwnedTemplate> = {}): OwnedTemplate {
  return {
    id: 'tpl-1',
    appUuid: 'app-1',
    templateKey: 'sdkwork-demo-h5',
    displayName: '演示 H5',
    latestVersion: '1.0.0',
    status: 'DRAFT',
    ...overrides,
  }
}

function archive(): TemplateAppArchive {
  return {
    archive: new Blob(['zip-bytes'], { type: 'application/zip' }),
    fileCount: 12,
    totalBytes: 2048,
    checksumSha256: 'abc123',
    listedFiles: 12,
    excludedSensitive: [],
  }
}

/** In-memory ports that record the side effects under test. */
function ports(overrides: Partial<TemplatePublishPorts> = {}): TemplatePublishPorts & {
  readonly calls: Record<string, number>
} {
  const calls: Record<string, number> = {}
  const record = (name: string): void => { calls[name] = (calls[name] ?? 0) + 1 }
  const base: TemplatePublishPorts = {
    listPlatformApps: async () => { record('listPlatformApps'); return [] },
    createPlatformApp: async () => { record('createPlatformApp'); return ownedApp() },
    createPlatformTarget: async () => { record('createPlatformTarget') },
    listTemplates: async () => { record('listTemplates'); return [] },
    createTemplate: async () => { record('createTemplate'); return ownedTemplate() },
    updateTemplate: async () => { record('updateTemplate'); return ownedTemplate() },
    createVersion: async () => { record('createVersion') },
    submitTemplate: async () => { record('submitTemplate') },
    packApp: async (_directory, onRead) => {
      record('packApp')
      onRead(12, 12)
      return archive()
    },
    uploadArchive: async () => { record('uploadArchive'); return { artifactId: 'art-1' } },
    writeAppLink: async () => { record('writeAppLink'); return true },
  }
  return Object.assign(base, { calls }, overrides)
}

const VALUES: TemplateAppValues = {
  displayName: '演示 H5',
  templateKey: 'sdkwork-demo-h5',
  summary: 'Mobile web app',
  version: '0.1.0',
  changelog: 'first',
}

describe('nextTemplateVersion', () => {
  it('bumps the patch version and falls back to 0.1.0', () => {
    expect(nextTemplateVersion('1.2.3')).toBe('1.2.4')
    expect(nextTemplateVersion('1.2.3-rc.1')).toBe('1.2.4')
    expect(nextTemplateVersion(undefined)).toBe('0.1.0')
    expect(nextTemplateVersion('')).toBe('0.1.0')
    expect(nextTemplateVersion('not-a-version')).toBe('0.1.0')
  })
})

describe('platformAppKind', () => {
  it('falls back to the first declared concrete platform when the card is ambiguous', () => {
    expect(platformAppKind(candidate())).toBe('SPA_WEB')
    expect(platformAppKind(candidate({ cardId: undefined, platforms: ['ANDROID', 'IOS'] }))).toBe('ANDROID_APP')
    expect(platformAppKind(candidate({ cardId: undefined, platforms: ['IOS'] }))).toBe('IOS_APP')
    expect(platformAppKind(candidate({ cardId: undefined, platforms: ['MINIPROGRAM'] }))).toBe('WECHAT_MINIPROGRAM')
    expect(platformAppKind(candidate({ cardId: undefined, platforms: [] }))).toBeUndefined()
  })
})

describe('matchPlatformApp', () => {
  it('prefers the manifest linkage, then the slug/name key, then the display name', () => {
    expect(matchPlatformApp(candidate({ linkedAppId: 'app-2' }), [
      ownedApp(), ownedApp({ id: 'app-2', slug: 'other' }),
    ])?.id).toBe('app-2')
    expect(matchPlatformApp(candidate(), [ownedApp()])?.id).toBe('app-1')
    expect(matchPlatformApp(candidate({ appKey: 'unknown', name: '演示 H5' }), [ownedApp()])?.id).toBe('app-1')
    expect(matchPlatformApp(candidate({ appKey: 'unknown', name: 'unknown' }), [ownedApp()])).toBeUndefined()
  })
})

describe('planTemplatePublications', () => {
  it('plans creation for an unregistered app and bumps an existing template version', () => {
    const plans = planTemplatePublications(
      [candidate(), candidate({ appKey: 'new-app', name: '新应用', directory: '/proj/apps/new-app' })],
      [ownedApp()],
      [ownedTemplate()],
    )
    expect(plans[0]?.platformApp?.id).toBe('app-1')
    expect(plans[0]?.template?.id).toBe('tpl-1')
    expect(plans[0]?.values.version).toBe('1.0.1')
    expect(plans[1]?.platformApp).toBeUndefined()
    expect(plans[1]?.template).toBeUndefined()
    expect(plans[1]?.values.version).toBe('0.1.0')
  })

  it('flags two selected roots that claim one template key', () => {
    const plans = planTemplatePublications(
      [candidate(), candidate({ directory: '/proj/apps/duplicate' })],
      [ownedApp()],
      [],
    )
    expect(plans[0]?.conflict).toContain('more than one selected app')
    expect(plans[1]?.conflict).toContain('more than one selected app')
  })

  it('reuses an owned listing by key even when its recorded source app differs', () => {
    const plans = planTemplatePublications(
      [candidate()],
      [ownedApp()],
      [ownedTemplate({ id: 'tpl-other', appUuid: 'app-9', latestVersion: '3.1.0' })],
    )
    expect(plans[0]?.conflict).toBeUndefined()
    expect(plans[0]?.template?.id).toBe('tpl-other')
    expect(plans[0]?.values.version).toBe('3.1.1')
  })

  it('uses the manifest-recorded template id and version for dedupe', () => {
    const plans = planTemplatePublications(
      [candidate({ linkedTemplateId: 'tpl-manifest', linkedTemplateVersion: '2.0.0' })],
      [ownedApp()],
      [ownedTemplate({ id: 'tpl-manifest', latestVersion: '2.0.0' })],
    )
    expect(plans[0]?.template?.id).toBe('tpl-manifest')
    expect(plans[0]?.values.version).toBe('2.0.1')
  })

  it('bumps the version recorded in the app manifest when the listing read carries none', () => {
    const plans = planTemplatePublications(
      [candidate({ linkedTemplateVersion: '4.2.0' })],
      [ownedApp()],
      [ownedTemplate({ latestVersion: undefined })],
    )
    expect(plans[0]?.values.version).toBe('4.2.1')
  })
})

describe('publishTemplateApp', () => {
  const settings = { categoryUuid: 'cat-1', visibility: 'PRIVATE' as const, submitForReview: false }

  it('registers the app, packs, uploads, and creates the listing with its first version', async () => {
    const plan = planTemplatePublications([candidate()], [], [])[0]
    expect(plan).toBeDefined()
    const p = ports()
    const stages: string[] = []
    const outcome = await publishTemplateApp(p, {
      plan: plan,
      values: VALUES,
      settings,
      onStage: (stage) => { stages.push(stage.kind) },
    })
    expect(outcome).toMatchObject({
      platformAppId: 'app-1',
      createdApp: true,
      createdTemplate: true,
      submitted: false,
      version: '0.1.0',
      fileCount: 12,
      totalBytes: 2048,
      linkWritten: true,
    })
    expect(p.calls.createPlatformApp).toBe(1)
    expect(p.calls.createPlatformTarget).toBe(1)
    expect(p.calls.createTemplate).toBe(1)
    expect(p.calls.createVersion).toBeUndefined()
    expect(p.calls.packApp).toBe(1)
    expect(p.calls.uploadArchive).toBe(1)
    // Link before packaging and again after the template identity is known.
    expect(p.calls.writeAppLink).toBe(2)
    // `packing` is announced once when the pack starts and again per read
    // batch, so the row shows progress without waiting for the first batch.
    expect(stages).toEqual(['registering', 'packing', 'packing', 'compressed', 'uploading', 'saving', 'linking'])
  })

  it('updates an existing listing and appends a version instead of creating a duplicate', async () => {
    const plan = planTemplatePublications([candidate()], [ownedApp()], [ownedTemplate()])[0]
    const p = ports({ listTemplates: async () => [ownedTemplate()] })
    const outcome = await publishTemplateApp(p, {
      plan: plan,
      values: { ...VALUES, version: '1.0.1', changelog: 'fix' },
      settings: { ...settings, visibility: 'PUBLIC', submitForReview: true },
    })
    expect(outcome.createdApp).toBe(false)
    expect(outcome.createdTemplate).toBe(false)
    expect(outcome.submitted).toBe(true)
    expect(p.calls.updateTemplate).toBe(1)
    expect(p.calls.createVersion).toBe(1)
    expect(p.calls.createTemplate).toBeUndefined()
    expect(p.calls.submitTemplate).toBe(1)
  })

  it('adopts a listing created concurrently between planning and execution', async () => {
    const plan = planTemplatePublications([candidate()], [ownedApp()], [])[0]
    const p = ports({ listTemplates: async () => [ownedTemplate()] })
    const outcome = await publishTemplateApp(p, { plan, values: VALUES, settings })
    expect(outcome.createdTemplate).toBe(false)
    expect(p.calls.createTemplate).toBeUndefined()
    expect(p.calls.createVersion).toBe(1)
  })

  it('keeps a failed linkage as a warning instead of failing the publish', async () => {
    const plan = planTemplatePublications([candidate()], [ownedApp()], [])[0]
    const p = ports({ writeAppLink: async () => false })
    const outcome = await publishTemplateApp(p, { plan, values: VALUES, settings })
    expect(outcome.linkWritten).toBe(false)
    expect(outcome.warnings.join(' ')).toContain('agent.app.config.json')
  })

  it('rejects an app whose manifest determines no platform kind', async () => {
    const plan = planTemplatePublications([candidate({ cardId: undefined, platforms: [] })], [], [])[0]
    await expect(publishTemplateApp(ports(), { plan, values: VALUES, settings }))
      .rejects.toBeInstanceOf(TemplateAppKindMissingError)
  })

  it('reuses an app registered concurrently before the create call', async () => {
    const plan = planTemplatePublications([candidate()], [], [])[0]
    const p = ports({ listPlatformApps: async () => [ownedApp()] })
    const outcome = await publishTemplateApp(p, { plan, values: VALUES, settings })
    expect(outcome.createdApp).toBe(false)
    expect(p.calls.createPlatformApp).toBeUndefined()
  })

  it('adopts the winner when the app create loses a slug race', async () => {
    const plan = planTemplatePublications([candidate()], [], [])[0]
    let listCalls = 0
    const p = ports({
      listPlatformApps: async () => {
        listCalls += 1
        return listCalls === 1 ? [] : [ownedApp()]
      },
      createPlatformApp: async () => { throw new Error('app slug sdkwork-demo-h5 already exists') },
    })
    const outcome = await publishTemplateApp(p, { plan, values: VALUES, settings })
    expect(outcome.createdApp).toBe(false)
    expect(outcome.platformAppId).toBe('app-1')
    expect(listCalls).toBe(2)
  })

  it('reports a refused listing update without losing the new version', async () => {
    const plan = planTemplatePublications([candidate()], [ownedApp()], [ownedTemplate()])[0]
    const p = ports({
      updateTemplate: async () => { throw new Error('disabled') },
      listTemplates: async () => [ownedTemplate()],
    })
    const outcome = await publishTemplateApp(p, { plan, values: VALUES, settings })
    expect(outcome.warnings.join(' ')).toContain('listing metadata')
    expect(p.calls.createVersion).toBe(1)
  })

  it('reports a failed review submission without failing the listing', async () => {
    const plan = planTemplatePublications([candidate()], [ownedApp()], [ownedTemplate()])[0]
    const p = ports({
      listTemplates: async () => [ownedTemplate()],
      submitTemplate: async () => { throw new Error('review unavailable') },
    })
    const outcome = await publishTemplateApp(p, {
      plan: plan,
      values: VALUES,
      settings: { ...settings, submitForReview: true },
    })
    expect(outcome.submitted).toBe(false)
    expect(outcome.warnings.join(' ')).toContain('review submission')
  })
})
