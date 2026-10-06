// @vitest-environment jsdom
/** Demand Hall page spec: the page renders its mode markers and hosts the
 * embedded demands catalog behind the crash boundary; the unconfigured
 * gateway face renders the status panel; the crash face recovers through
 * retry; the theme shell mirrors the scheme onto the document root while
 * mounted and restores it on unmount. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { GlobalStandardProps, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DemandHallPage, type DemandHallPageProps } from '../src/client/DemandHallPage.tsx'
import { DemandHallEmptySurface } from '../src/client/DemandHallEmptySurface.tsx'
import { DemandHallSurfaceBoundary } from '../src/client/DemandHallSurfaceBoundary.tsx'
import {
  SdkworkHostThemeSurface,
  type HostThemeBridge,
} from '../src/client/sdkworkHostThemeSurface.tsx'
import type { DemandHallKey } from '../src/client/locales.ts'

// The embedded SDKWork demands page is mocked: its marker is rendered
// verbatim so assertions read the page contract without the App Store stack.
vi.mock('../src/client/demandHallHost.ts', () => ({
  DemandHallApp: ({ t }: { t: (key: DemandHallKey) => string }) => (
    <div data-testid="demand-hall-app">Demands surface {t('surface.unconfigured.title')}</div>
  ),
}))

afterEach(() => { cleanup() })

function pageProps(): DemandHallPageProps {
  // The page reads none of the standard hooks; supply the empty kit shape.
  const standard = {} as GlobalStandardProps & PropsRuntime<'mode.page'>
  return {
    ...standard,
    mode: 'demand-hall',
    t: (key: Parameters<DemandHallPageProps['t']>[0]) => key,
  }
}

describe('DemandHallPage', () => {
  it('renders the mode markers and the embedded demands surface', () => {
    const view = render(<DemandHallPage {...pageProps()} />)
    const app = view.getByTestId('demand-hall-app')
    expect(app.textContent).toContain('Demands surface')
    const root = app.closest('[data-mode]')
    expect(root?.getAttribute('data-mode')).toBe('demand-hall')
    expect(root?.getAttribute('data-mode-page')).toBe('demand-hall')
    expect(root?.getAttribute('data-demand-hall-surface')).toBe('sdkwork')
  })

  it('renders the unconfigured status face when the gateway is absent', () => {
    const view = render(<DemandHallEmptySurface t={key => key} />)
    expect(view.getByText('surface.unconfigured.title')).toBeTruthy()
    expect(view.getByText('surface.unconfigured.detail')).toBeTruthy()
    expect(view.container.querySelector('[data-demand-hall-empty="unconfigured"]')).toBeTruthy()
  })
})

describe('DemandHallSurfaceBoundary', () => {
  /** A child that throws when asked, which is the only thing a fence must catch. */
  function Exploding({ explode }: { readonly explode: boolean }): ReactNode {
    if (explode) throw new Error('demands surface broke')
    return <p data-boundary-child>intact</p>
  }

  it('keeps the column themed with a retry action when the surface crashes', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const view = render(
        <DemandHallSurfaceBoundary t={key => key}>
          <Exploding explode />
        </DemandHallSurfaceBoundary>,
      )
      expect(view.container.querySelector('[data-demand-hall-empty="crashed"]')).toBeTruthy()
      expect(view.getByText('surface.error.title')).toBeTruthy()
      expect(view.getByText('surface.error.detail')).toBeTruthy()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('remounts the surface tree when the reader retries', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const view = render(
        <DemandHallSurfaceBoundary t={key => key}>
          <Exploding explode />
        </DemandHallSurfaceBoundary>,
      )
      fireEvent.click(view.getByText('surface.error.retry'))
      // The retry clears the crash face; the (still-exploding) child throws
      // again, proving the tree remounted rather than staying crashed.
      expect(view.container.querySelector('[data-demand-hall-empty="crashed"]')).toBeTruthy()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('renders the surface tree untouched while it stands', () => {
    const view = render(
      <DemandHallSurfaceBoundary t={key => key}>
        <Exploding explode={false} />
      </DemandHallSurfaceBoundary>,
    )
    expect(view.container.querySelector('[data-boundary-child]')).toBeTruthy()
    expect(view.container.querySelector('[data-demand-hall-empty]')).toBeNull()
  })
})

describe('SdkworkHostThemeSurface', () => {
  function themeBridge(overrides: Partial<HostThemeBridge> = {}): HostThemeBridge & { fire: () => void } {
    // The component makes two subscriptions (scheme + brand color), so the
    // double fans out over a set rather than one listener slot.
    const listeners = new Set<() => void>()
    return {
      getColorScheme: overrides.getColorScheme ?? (() => 'light'),
      subscribe: (l) => {
        listeners.add(l)
        return () => { listeners.delete(l) }
      },
      ...overrides,
      fire: () => { for (const l of listeners) l() },
    }
  }

  it('renders the shell with the surface marker and default brand', () => {
    const theme = themeBridge()
    const view = render(
      <SdkworkHostThemeSurface theme={theme} surface="demand-hall">
        <p>body</p>
      </SdkworkHostThemeSurface>,
    )
    const shell = view.container.firstElementChild as HTMLElement
    expect(shell.getAttribute('data-sdk-surface')).toBe('demand-hall')
    expect(shell.getAttribute('data-sdk-color-mode')).toBe('light')
    expect(shell.className).toContain('flex')
    expect(shell.hasAttribute('data-theme')).toBe(false)
  })

  it('omits the surface marker when none is given', () => {
    const theme = themeBridge()
    const view = render(<SdkworkHostThemeSurface theme={theme} />)
    expect(view.container.firstElementChild?.hasAttribute('data-sdk-surface')).toBe(false)
  })

  it('carries a brand theme color when the host provides one', () => {
    const theme = themeBridge({ getThemeColor: () => 'ocean' })
    const view = render(<SdkworkHostThemeSurface theme={theme} />)
    expect(view.container.firstElementChild?.getAttribute('data-theme')).toBe('ocean')
  })

  it('mirrors the scheme onto the document root and restores it on unmount', () => {
    document.documentElement.classList.add('light-mode')
    document.documentElement.setAttribute('data-sdk-color-mode', 'light')
    const theme = themeBridge({ getColorScheme: () => 'dark' })
    const view = render(<SdkworkHostThemeSurface theme={theme} />)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.getAttribute('data-sdk-color-mode')).toBe('dark')
    view.unmount()
    // The pre-mount root state is restored, not reset to defaults.
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.classList.contains('light-mode')).toBe(true)
    expect(document.documentElement.getAttribute('data-sdk-color-mode')).toBe('light')
    document.documentElement.classList.remove('light-mode')
    document.documentElement.removeAttribute('data-sdk-color-mode')
  })

  it('follows scheme changes while mounted and restores a bare root', () => {
    const theme = themeBridge()
    const view = render(<SdkworkHostThemeSurface theme={theme} />)
    theme.getColorScheme = () => 'dark'
    act(() => { theme.fire() })
    const shell = view.container.firstElementChild as HTMLElement
    expect(shell.getAttribute('data-sdk-color-mode')).toBe('dark')
    expect(shell.className).toContain('dark')
    view.unmount()
    expect(document.documentElement.hasAttribute('data-sdk-color-mode')).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
