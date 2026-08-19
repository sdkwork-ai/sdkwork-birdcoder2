// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  AppHeader, type AppHeaderProps,
} from '../src/client/AppHeader.tsx'
import { resolvePlatform, titleKeyForMode } from '../src/client/platform.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function headerProps(over: Partial<AppHeaderProps> = {}): AppHeaderProps {
  const t = (key: string) => key
  const renderSlot = () => null
  return {
    mode: 'drive',
    hasWindowControls: false,
    platform: 'other',
    t,
    renderSlot,
    ...over,
  } as unknown as AppHeaderProps
}

describe('AppHeader', () => {
  it('renders the active mode title', () => {
    render(<AppHeader {...headerProps({ mode: 'knowledge' })} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(titleKeyForMode('knowledge'))
  })

  it('reserves window-control space on desktop', () => {
    const { container } = render(<AppHeader {...headerProps({ hasWindowControls: true, platform: 'win32' })} />)
    expect(container.querySelector('[aria-hidden="true"][data-platform="win32"]')).not.toBeNull()
  })

  it('omits the spacer without the desktop bridge', () => {
    const { container } = render(<AppHeader {...headerProps({ hasWindowControls: false })} />)
    expect(container.querySelector('.controlsSpacer')).toBeNull()
  })

  it('marks the header with the active mode', () => {
    const { container } = render(<AppHeader {...headerProps({ mode: 'drive' })} />)
    expect(container.querySelector('[data-mode="drive"]')).not.toBeNull()
  })
})

describe('platform helpers', () => {
  it('maps known platform strings', () => {
    expect(resolvePlatform('Win32')).toBe('win32')
    expect(resolvePlatform('MacIntel')).toBe('darwin')
    expect(resolvePlatform('Linux x86_64')).toBe('linux')
    expect(resolvePlatform('unknown')).toBe('other')
  })
})
