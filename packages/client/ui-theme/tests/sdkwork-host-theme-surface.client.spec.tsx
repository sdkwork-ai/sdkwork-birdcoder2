// @vitest-environment jsdom
/** SdkworkHostThemeSurface mirrors the harness scheme onto the root and a scoped wrapper. */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SdkworkHostThemeSurface, type HostThemeBridge } from '../src/client/index.ts'

function bridge(initial: 'light' | 'dark'): HostThemeBridge & { fire: () => void } {
  let scheme = initial
  let listener: (() => void) | undefined
  return {
    getColorScheme: () => scheme,
    subscribe: (l) => {
      listener = l
      return () => { listener = undefined }
    },
    fire: () => {
      scheme = scheme === 'light' ? 'dark' : 'light'
      listener?.()
    },
  }
}

describe('SdkworkHostThemeSurface', () => {
  afterEach(() => {
    cleanup()
    document.documentElement.classList.remove('dark', 'light-mode')
    document.documentElement.removeAttribute('data-sdk-color-mode')
  })

  it('applies light mode without a scoped dark class', () => {
    const theme = bridge('light')
    const { container } = render(
      <SdkworkHostThemeSurface theme={theme} surface="fixture">
        <span>body</span>
      </SdkworkHostThemeSurface>,
    )
    const shell = container.firstElementChild!
    expect(shell.classList.contains('dark')).toBe(false)
    expect(shell.getAttribute('data-sdk-color-mode')).toBe('light')
    expect(shell.getAttribute('data-sdk-surface')).toBe('fixture')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.classList.contains('light-mode')).toBe(true)
    expect(document.documentElement.getAttribute('data-sdk-color-mode')).toBe('light')
  })

  it('applies dark mode on the scoped shell and document root', () => {
    const theme = bridge('dark')
    const { container } = render(
      <SdkworkHostThemeSurface theme={theme}>
        <span>body</span>
      </SdkworkHostThemeSurface>,
    )
    const shell = container.firstElementChild!
    expect(shell.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.getAttribute('data-sdk-color-mode')).toBe('dark')
  })

  it('reacts to host theme changes and restores the previous root classes on unmount', () => {
    document.documentElement.classList.add('dark')
    document.documentElement.setAttribute('data-sdk-color-mode', 'dark')
    const theme = bridge('light')
    const view = render(
      <SdkworkHostThemeSurface theme={theme}>
        <span>body</span>
      </SdkworkHostThemeSurface>,
    )
    expect(document.documentElement.classList.contains('light-mode')).toBe(true)
    act(() => { theme.fire() })
    expect(view.container.firstElementChild?.classList.contains('dark')).toBe(true)
    view.unmount()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light-mode')).toBe(false)
    expect(document.documentElement.getAttribute('data-sdk-color-mode')).toBe('dark')
  })
})
