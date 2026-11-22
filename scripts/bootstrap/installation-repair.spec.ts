import { describe, expect, it } from 'vitest'
import {
  buildReconcileBody,
  buildUpdateBody,
  parseFlags,
  renderReconcileReport,
  renderUpdateReport,
  resolveDeployApplicationId,
} from './installation-repair.ts'

const INSTALLATION = 'tapp_100001_0_01a18b4f_6eed_7fd1_beca_780a4c7a8d66'
const DESKTOP_ANCHOR = '382429273660592128'

describe('parseFlags', () => {
  it('reads space-separated and inline values', () => {
    const flags = parseFlags(['--installation-id', INSTALLATION, '--dry-run=x'])
    expect(flags['installation-id']).toBe(INSTALLATION)
    expect(flags['dry-run']).toBe('x')
  })

  it('records a bare switch as true, including as the last argument', () => {
    expect(parseFlags(['--installation-id', INSTALLATION, '--no-enable'])).toEqual({
      'installation-id': INSTALLATION,
      'no-enable': 'true',
    })
    expect(parseFlags(['--verify-only'])).toEqual({ 'verify-only': 'true' })
    expect(parseFlags(['--dry-run', '--no-enable'])).toEqual({
      'dry-run': 'true',
      'no-enable': 'true',
    })
  })

  it('ignores positional arguments', () => {
    expect(parseFlags(['repair', '--installation-id', INSTALLATION])).toEqual({
      'installation-id': INSTALLATION,
    })
  })
})

describe('resolveDeployApplicationId', () => {
  it('prefers the flag over every other source', () => {
    expect(resolveDeployApplicationId({
      flag: DESKTOP_ANCHOR,
      env: { SDKWORK_DEPLOY_APPLICATION_ID: '111' },
      manifest: { backend: { appId: '222' } },
    })).toEqual({ deployApplicationId: DESKTOP_ANCHOR, source: '--deploy-application-id' })
  })

  it('falls back to the export, then the manifest anchor, then the runtime app id', () => {
    expect(resolveDeployApplicationId({
      env: { SDKWORK_DEPLOY_APPLICATION_ID: '111' },
      manifest: { backend: { appId: '222' } },
    }).source).toBe('SDKWORK_DEPLOY_APPLICATION_ID')
    expect(resolveDeployApplicationId({
      manifest: { backend: { deployApplicationId: '333', appId: '222' } },
    })).toEqual({ deployApplicationId: '333', source: 'backend.deployApplicationId' })
    expect(resolveDeployApplicationId({
      manifest: { backend: { appId: '222' } },
    })).toEqual({ deployApplicationId: '222', source: 'backend.appId' })
  })

  it('never invents an anchor', () => {
    expect(() => resolveDeployApplicationId({ env: {}, manifest: {} })).toThrow(/no deploy application anchor/u)
  })
})

describe('buildReconcileBody', () => {
  it('writes the username/password credential shape and the repair intent', () => {
    const body = buildReconcileBody({
      tenantId: ' 100001 ',
      auth: { username: 'admin', password: 'secret' },
      deployApplicationId: DESKTOP_ANCHOR,
      dryRun: true,
    })
    expect(body).toEqual({
      tenantId: '100001',
      username: 'admin',
      password: 'secret',
      deployApplicationId: DESKTOP_ANCHOR,
      enable: true,
      dryRun: true,
    })
  })

  it('prefers authToken, carries the runtime config and the correlation key', () => {
    const body = buildReconcileBody({
      tenantId: '100001',
      auth: { authToken: 'token', username: 'admin', password: 'secret' },
      runtimeConfig: { oauth: { relyingParty: { clientId: 'birdcoder' } } },
      enable: false,
      dryRun: false,
      idempotencyKey: ' pipeline-42 ',
    })
    expect(body).toEqual({
      tenantId: '100001',
      authToken: 'token',
      runtimeConfig: { oauth: { relyingParty: { clientId: 'birdcoder' } } },
      idempotencyKey: 'pipeline-42',
      enable: false,
      dryRun: false,
    })
  })

  it('refuses a missing tenant or credential', () => {
    expect(() => buildReconcileBody({ tenantId: ' ', auth: { authToken: 't' } })).toThrow(/tenantId/u)
    expect(() => buildReconcileBody({ tenantId: '100001', auth: {} })).toThrow(/no bootstrap credential/u)
    expect(() => buildReconcileBody({
      tenantId: '100001',
      auth: { email: 'admin@sdkwork.com' },
    })).toThrow(/no bootstrap credential/u)
  })
})

describe('buildUpdateBody and renderUpdateReport', () => {
  it('carries the anchor and the credential through installations.update', () => {
    const body = buildUpdateBody({
      tenantId: '100001',
      auth: { authToken: 'token' },
      deployApplicationId: DESKTOP_ANCHOR,
    })
    expect(body).toEqual({
      tenantId: '100001',
      authToken: 'token',
      deployApplicationId: DESKTOP_ANCHOR,
    })
  })

  it('refuses a body without a credential', () => {
    expect(() => buildUpdateBody({ tenantId: '100001', auth: {} })).toThrow(/no bootstrap credential/u)
  })

  it('reports the anchor the write produced and flags an unexpected one', () => {
    const lines = renderUpdateReport(
      { installationId: INSTALLATION, deployApplicationId: DESKTOP_ANCHOR, status: 'pending_config' },
      { deployApplicationId: DESKTOP_ANCHOR },
    )
    expect(lines[0]).toContain('installations.update repaired')
    expect(lines[1]).toContain(DESKTOP_ANCHOR)
    expect(lines[1]).not.toContain('unexpected anchor')

    const mismatched = renderUpdateReport(
      { installationId: INSTALLATION, deployApplicationId: '999' },
      { deployApplicationId: DESKTOP_ANCHOR },
    )
    expect(mismatched[1]).toContain('unexpected anchor')
    expect(renderUpdateReport(null, { deployApplicationId: DESKTOP_ANCHOR })).toEqual([])
  })
})

describe('renderReconcileReport', () => {
  it('prints steps, remaining defects, and the readiness verdict', () => {
    const lines = renderReconcileReport({
      installationId: INSTALLATION,
      changed: true,
      steps: [{ field: 'deployApplicationId', status: 'applied', detail: 'bound' }],
      readinessAfter: {
        ready: false,
        defects: [{
          code: 'relying_party_missing',
          field: 'runtimeConfig.oauth.relyingParty',
          message: 'no client',
          operation: 'iam.installations.reconcile',
        }],
      },
    }, { dryRun: false })
    expect(lines[0]).toContain('repaired')
    expect(lines[1]).toContain('applied')
    expect(lines[2]).toContain('relying_party_missing')
    expect(lines[2]).toContain('iam.installations.reconcile')
    expect(lines.at(-1)).toBe('  ready: false')
  })

  it('says nothing was written on a dry run and tolerates a shapeless answer', () => {
    expect(renderReconcileReport({}, { dryRun: true })[0]).toContain('dry run — nothing written')
    expect(renderReconcileReport(null, { dryRun: true })).toEqual([])
  })
})
