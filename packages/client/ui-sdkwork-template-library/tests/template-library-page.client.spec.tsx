// @vitest-environment jsdom
/** Template Library page spec: the page renders its mode markers and hosts
 * the embedded catalog behind the crash boundary, and the unconfigured
 * gateway face renders the status panel instead of collapsing blank. (The
 * boundary's crash face itself is exercised against the built surface by the
 * markets probe lane; a jsdom double cannot re-mount through it.) */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { GlobalStandardProps, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { TemplateLibraryPage, type TemplateLibraryPageProps } from '../src/client/TemplateLibraryPage.tsx'
import { TemplateLibraryEmptySurface } from '../src/client/TemplateLibraryEmptySurface.tsx'
import type { TemplateLibraryKey } from '../src/client/locales.ts'

// The embedded SDKWork catalog page is mocked: its marker is rendered
// verbatim so assertions read the page contract without the App Store stack.
vi.mock('../src/client/templateLibraryHost.ts', () => ({
  TemplateLibraryApp: ({ t, publishSlotSelector }: {
    t: (key: TemplateLibraryKey) => string
    publishSlotSelector?: string
  }) => (
    <div
      data-testid="template-library-app"
      {...(publishSlotSelector === undefined ? {} : { 'data-publish-slot-selector': publishSlotSelector })}
    >
      Catalog surface {t('surface.unconfigured.title')}
    </div>
  ),
}))

afterEach(() => { cleanup() })

function pageProps(): TemplateLibraryPageProps {
  // The page reads none of the standard hooks; supply the empty kit shape.
  const standard = {} as GlobalStandardProps & PropsRuntime<'mode.page'>
  return {
    ...standard,
    mode: 'template-library',
    t: (key: Parameters<TemplateLibraryPageProps['t']>[0]) => key,
  }
}

describe('TemplateLibraryPage', () => {
  it('renders the mode markers and the embedded catalog surface', () => {
    const view = render(<TemplateLibraryPage {...pageProps()} />)
    const app = view.getByTestId('template-library-app')
    expect(app.textContent).toContain('Catalog surface')
    const root = app.closest('[data-mode]')
    expect(root?.getAttribute('data-mode')).toBe('template-library')
    expect(root?.getAttribute('data-mode-page')).toBe('template-library')
    expect(root?.getAttribute('data-template-library-surface')).toBe('sdkwork')
  })

  it('renders the unconfigured status face when the gateway is absent', () => {
    const view = render(<TemplateLibraryEmptySurface t={key => key} />)
    expect(view.getByText('surface.unconfigured.title')).toBeTruthy()
    expect(view.getByText('surface.unconfigured.detail')).toBeTruthy()
    expect(view.container.querySelector('[data-template-library-empty="unconfigured"]')).toBeTruthy()
  })

  it('mounts the publish-button slot in the deploy row and routes it to the app when the deploy port is present', () => {
    const deploy = {
      search: async () => [],
      install: async () => ({ fileCount: 0 }),
      pickDirectory: async () => undefined,
    }
    const view = render(<TemplateLibraryPage {...pageProps()} deployTemplates={deploy} />)
    // The deploy panel's head row carries the slot the embedded catalog
    // portals its publish button into.
    const slot = view.container.querySelector('[data-template-library-publish-slot]')
    expect(slot).toBeTruthy()
    const app = view.getByTestId('template-library-app')
    expect(app.getAttribute('data-publish-slot-selector')).toBe('[data-template-library-publish-slot]')
  })

  it('keeps no publish slot and routes none when the deploy port is absent', () => {
    const view = render(<TemplateLibraryPage {...pageProps()} />)
    expect(view.container.querySelector('[data-template-library-publish-slot]')).toBeNull()
    expect(view.getByTestId('template-library-app').getAttribute('data-publish-slot-selector')).toBeNull()
  })
})
