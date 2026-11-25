// @vitest-environment jsdom
/**
 * The deployed-site right-Sidebar panel: the header, the four views, the
 * dashboard read, refresh and failure states.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SdkworkDeploySite } from '@deepseek-ai/dsh-tool-sdkwork-deploy/types'
import { DeploySitePanel } from '../src/client/DeploySitePanel.tsx'
import type { DeploySiteDashboard } from '../src/client/deploySite.ts'
import { zh, type DeployKey } from '../src/client/locales.ts'

const actHost = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actHost.IS_REACT_ACT_ENVIRONMENT = true

/** Translate through the plugin's zh dictionary. */
function translate(key: DeployKey, params?: Record<string, string>): string {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}

const SITE: SdkworkDeploySite = {
  appId: 'app-1',
  appName: 'Skyline Analytics',
  siteUrl: 'https://skyline.example.com/',
  environment: 'production',
  version: '1.2.0',
  appStatus: 'ACTIVE',
  releaseId: 'release-1',
  deploymentId: 'deployment-1',
  publishedBy: 'Alice',
  sourceRecorded: true,
  previousDeploymentId: 'deployment-0',
  coverUrl: 'https://cdn.example.com/cover.png',
}

const DASHBOARD: DeploySiteDashboard = {
  app: {
    id: 'app-1', name: 'Skyline Analytics', slug: 'skyline-analytics', kind: 'PC_WEB', status: 'ACTIVE',
    ownerType: 'USER', defaultEnvironment: 'production', createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  },
  domains: [{ hostname: 'skyline.example.com', kind: 'DEFAULT', environment: 'production', bindingStatus: 'ACTIVE', verificationStatus: 'NOT_REQUIRED', isCanonical: true }],
  targets: [{ id: 'target-1', targetKey: 'pc-web', platform: 'WEB', techStack: 'react', status: 'READY' }],
  releases: [{ id: 'release-1', version: '1.2.0', status: 'RELEASED', createdAt: '2026-11-20T00:00:00.000Z' }],
  deployments: [{ id: 'deployment-1', environment: 'production', status: 'SUCCEEDED', kind: 'ARTIFACT_RELEASE', target: 'WEB_NODE', startedAt: '2026-11-20T00:00:00.000Z', createdAt: '2026-11-20T00:00:00.000Z' }],
  health: [{ id: 'health-1', checkType: 'HTTP', checkUrl: 'https://skyline.example.com/health', status: 'HEALTHY' }],
}

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => { root.unmount() })
  vi.restoreAllMocks()
})

/** Render the panel against a fresh container and flush its first read. */
async function render(options: {
  site?: SdkworkDeploySite
  loadDashboard?: (appId: string) => Promise<DeploySiteDashboard>
} = {}): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  const useTabInfo = () => ({ tab: { id: 'tab-1', contentId: 'sdkwork-deploy-site', navigation: { params: options.site === undefined ? undefined : { site: options.site }, revision: 1 } } })
  const loadDashboard = vi.fn(options.loadDashboard ?? (() => Promise.resolve(DASHBOARD)))
  act(() => {
    root.render(createElement(DeploySitePanel, {
      useTabInfo,
      loadDashboard,
      t: translate,
    } as never))
  })
  await act(async () => { await Promise.resolve() })
  return container
}

describe('deployed-site panel', () => {
  it('reads the dashboard and shows the header and observation metrics', async () => {
    const container = await render({ site: SITE })
    expect(container.textContent).toContain('Skyline Analytics')
    expect(container.textContent).toContain('https://skyline.example.com/')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/cover.png')
    expect(container.textContent).toContain(translate('site.view.observability'))
    expect(container.textContent).toContain(translate('site.metric.latestRelease'))
    expect(container.textContent).toContain('1.2.0')
    expect(container.textContent).toContain('HTTP')
    expect(container.textContent).toContain('SUCCEEDED')
  })

  it('switches between the management, history and log views', async () => {
    const container = await render({ site: SITE })
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    expect(tabs).toHaveLength(4)
    act(() => { tabs[1].click() })
    expect(container.textContent).toContain(translate('site.section.targets'))
    expect(container.textContent).toContain('skyline.example.com')
    act(() => { tabs[2].click() })
    expect(container.textContent).toContain(translate('site.section.releases'))
    expect(container.textContent).toContain('1.2.0')
    act(() => { tabs[3].click() })
    expect(container.textContent).toContain(translate('site.section.latestDeployment'))
    expect(container.textContent).toContain('WEB_NODE')
    expect(container.textContent).toContain('Alice')
    expect(container.textContent).toContain(translate('site.log.previousDeployment'))
    expect(container.textContent).toContain('deployment-0')
  })

  it('re-reads the dashboard when refresh is requested', async () => {
    const loadDashboard = vi.fn(() => Promise.resolve(DASHBOARD))
    await render({ site: SITE, loadDashboard })
    expect(loadDashboard).toHaveBeenCalledTimes(1)
    const refresh = [...document.querySelectorAll('button')].find(button => button.textContent === translate('site.panel.refresh'))
    expect(refresh).toBeDefined()
    await act(async () => {
      refresh!.click()
      await Promise.resolve()
    })
    expect(loadDashboard).toHaveBeenCalledTimes(2)
  })

  it('shows the read failure without dropping the header', async () => {
    const container = await render({ site: SITE, loadDashboard: () => Promise.reject(new Error('gateway down')) })
    expect(container.textContent).toContain(translate('site.panel.error'))
    expect(container.textContent).toContain('gateway down')
    expect(container.textContent).toContain('Skyline Analytics')
  })

  it('states that no site information is available without navigation parameters', async () => {
    const container = await render()
    expect(container.textContent).toContain(translate('site.panel.missing'))
  })
})
