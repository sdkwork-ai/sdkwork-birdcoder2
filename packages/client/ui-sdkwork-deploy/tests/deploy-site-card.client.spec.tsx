// @vitest-environment jsdom
/**
 * The published-site conversation card: the running row, the published site
 * with its panel affordance and copy control, and the reported failure.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SdkworkDeploySite } from '@deepseek-ai/dsh-tool-sdkwork-deploy/types'
import { DeploySiteCard, readDeployOutput } from '../src/client/DeploySiteCard.tsx'
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
  domain: 'skyline.example.com',
  environment: 'production',
  version: '1.2.0',
  appStatus: 'ACTIVE',
  coverUrl: 'https://cdn.example.com/cover.png',
}

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => { root.unmount() })
  vi.restoreAllMocks()
})

/** Render one card against a fresh container. */
function render(props: Record<string, unknown>): { container: HTMLElement; root: Root } {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => { root.render(createElement(DeploySiteCard, props as never)) })
  return { container, root }
}

/** One settled result block carrying recorded deploy metadata. */
function resultBlock(meta: unknown): Record<string, unknown> {
  return { kind: 'tool-result', content: [{ type: 'text', text: 'published' }], isError: false, meta }
}

describe('published-site card', () => {
  it('falls back to the application initial when the cover fails to load', () => {
    const { container } = render({
      phase: 'result',
      block: resultBlock({ deploy: { ok: true, status: 'published', site: SITE } }),
      t: translate,
      openSite: vi.fn(),
    })
    const cover = container.querySelector<HTMLImageElement>('img')
    expect(cover).not.toBeNull()
    act(() => { cover!.dispatchEvent(new Event('error')) })
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('Skyline Analytics')
  })

  it('marks a platform-default domain before a canonical binding is read', () => {
    const { container } = render({
      phase: 'result',
      block: resultBlock({
        deploy: {
          ok: true,
          status: 'published',
          site: { ...SITE, domain: 'skyline.app.birdcoder.com', siteUrl: 'https://skyline.app.birdcoder.com/', domainDefault: true },
        },
      }),
      t: translate,
      openSite: vi.fn(),
    })
    expect(container.textContent).toContain('https://skyline.app.birdcoder.com/')
    expect(container.textContent).toContain(translate('site.card.defaultDomain'))
  })

  it('shows the running row before the call settles', () => {
    const { container } = render({ phase: 'preparing', block: {}, t: translate })
    expect(container.textContent).toContain(translate('site.card.running'))
    expect(container.querySelector('[data-state="published"]')).toBeNull()
  })

  it('renders the published site and opens the panel when selected', () => {
    const openSite = vi.fn()
    const { container } = render({
      phase: 'result',
      block: resultBlock({ deploy: { ok: true, status: 'published', site: SITE } }),
      t: translate,
      openSite,
    })
    expect(container.textContent).toContain('Skyline Analytics')
    expect(container.textContent).toContain('https://skyline.example.com/')
    expect(container.textContent).toContain('production')
    expect(container.textContent).toContain('v1.2.0')
    expect(container.textContent).toContain(translate('site.card.public'))
    const cover = container.querySelector<HTMLImageElement>('img')
    expect(cover?.getAttribute('src')).toBe('https://cdn.example.com/cover.png')
    const card = container.querySelector<HTMLButtonElement>('button[data-state="published"]')
    expect(card).not.toBeNull()
    act(() => { card!.click() })
    expect(openSite).toHaveBeenCalledWith(SITE)
  })

  it('copies the address without opening the panel', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { clipboard: { writeText } })
    const openSite = vi.fn()
    const { container } = render({
      phase: 'result',
      block: resultBlock({ deploy: { ok: true, status: 'published', site: SITE } }),
      t: translate,
      openSite,
    })
    const copy = container.querySelector<HTMLElement>('[role="button"][aria-label]')
    expect(copy).not.toBeNull()
    await act(async () => {
      copy!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith('https://skyline.example.com/')
    expect(openSite).not.toHaveBeenCalled()
    expect(container.textContent).toContain(translate('site.card.copied'))
  })

  it('renders the reported failure with its stage and detail', () => {
    const { container } = render({
      phase: 'result',
      block: resultBlock({ deploy: { ok: false, status: 'failed', stage: 'uploadArchive', message: 'upload rejected' } }),
      t: translate,
      openSite: vi.fn(),
    })
    expect(container.textContent).toContain(translate('site.card.failed'))
    expect(container.textContent).toContain('uploadArchive')
    expect(container.textContent).toContain('upload rejected')
    expect(container.querySelector('button')).toBeNull()
  })

  it('falls back to the recorded text when a result carries no deploy metadata', () => {
    const { container } = render({
      phase: 'result',
      block: { kind: 'tool-result', content: [{ type: 'text', text: 'legacy result text' }], isError: false },
      t: translate,
      openSite: vi.fn(),
    })
    expect(container.textContent).toContain('legacy result text')
  })

  it('ignores metadata that carries no deploy outcome', () => {
    expect(readDeployOutput(undefined)).toBeUndefined()
    expect(readDeployOutput('deploy')).toBeUndefined()
    expect(readDeployOutput({ deploy: 1 })).toBeUndefined()
    expect(readDeployOutput({ deploy: { status: 'published' } })).toBeUndefined()
  })
})
