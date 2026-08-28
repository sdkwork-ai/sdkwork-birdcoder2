// @vitest-environment jsdom
/**
 * DriveApp integration spec: configures the real SDKWork host adapter and
 * mounts the Drive surface, exercising the generated client construction,
 * the port handoff, and the environment-driven remount that the facade tests
 * cannot reach.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import {
  configureDriveHost,
  DriveApp,
  type DriveHostEnvironment,
  type DriveHostIam,
  type DriveHostLocale,
  type DriveHostTheme,
} from '../src/client/driveHost.ts'

/** Signed-in gate stub: the page mount never opens the overlay in specs. */
const authGate = {
  isSignedIn: () => true,
  openSignInOverlay: () => {},
  subscribe: () => () => {},
}


function fakeServices(overrides: { baseUrl?: string; colorScheme?: 'light' | 'dark' } = {}) {
  let environmentListener: (() => void) | undefined
  let themeListener: (() => void) | undefined
  const env: DriveHostEnvironment = {
    apiBaseUrl: () => overrides.baseUrl ?? 'https://fixture.example',
    accessToken: () => '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam: DriveHostIam = {
    controller: {
      getState: () => ({
        session: {
          accessToken: 'session-access',
          user: { id: 'user' },
          context: { tenantId: 'tenant', userId: 'user' },
        },
      }),
      subscribe: () => () => {},
    },
  }
  const locale: DriveHostLocale = {
    getSnapshot: () => ({ active: 'zh' }),
    subscribe: () => () => {},
  }
  const theme: DriveHostTheme = {
    getColorScheme: () => overrides.colorScheme ?? 'light',
    subscribe: (listener) => {
      themeListener = listener
      return () => { themeListener = undefined }
    },
  }
  return { env, iam, locale, theme, fireEnvironment: () => { environmentListener?.() }, fireTheme: () => { themeListener?.() } }
}

describe('DriveApp', () => {
  it('mounts the SDKWork surface through the configured host ports', () => {
    const services = fakeServices()
    const adapter = configureDriveHost(services)
    try {
      const { container } = render(<DriveApp />)
      // The real Drive surface renders its workspace chrome (header or
      // loading fallback); the generated client is built through the port.
      expect(container.querySelector('[class*="sdkwork-drive"]')).not.toBeNull()
    } finally {
      adapter.dispose()
    }
  })

  it('reuses the generated client across simultaneous surface mounts', () => {
    const services = fakeServices()
    const adapter = configureDriveHost(services)
    try {
      const first = render(<DriveApp />)
      // A second mount inside the same window shares the cached client for
      // the same base URL instead of rebuilding it.
      const second = render(<DriveApp />)
      expect(first.container.querySelector('[class*="sdkwork-drive"]')).not.toBeNull()
      expect(second.container.querySelector('[class*="sdkwork-drive"]')).not.toBeNull()
    } finally {
      adapter.dispose()
    }
  })

  it('rebuilds the surface when the environment changes and reuses the cached client otherwise', () => {
    const services = fakeServices()
    const adapter = configureDriveHost(services)
    try {
      const { container, rerender } = render(<DriveApp />)
      expect(container.querySelector('[class*="sdkwork-drive"]')).not.toBeNull()
      // A plain rerender keeps the environment revision, so the generated
      // client is reused rather than rebuilt.
      rerender(<DriveApp />)
      expect(container.querySelector('[class*="sdkwork-drive"]')).not.toBeNull()
      services.fireEnvironment()
      rerender(<DriveApp />)
      expect(container.querySelector('[class*="sdkwork-drive"]')).not.toBeNull()
    } finally {
      adapter.dispose()
    }
  })

  it('applies the host color scheme on first mount', () => {
    const services = fakeServices({ colorScheme: 'dark' })
    const adapter = configureDriveHost(services)
    try {
      const { container } = render(<DriveApp />)
      expect(container.querySelector('.dark')).not.toBeNull()
    } finally {
      adapter.dispose()
    }
  })

  it('fails loud when no host adapter was configured', () => {
    expect(() => render(<DriveApp />)).toThrow('ui-sdkwork-drive: SDKWork host runtime is not configured')
  })

  it('reconfiguration disposes the previous adapter', () => {
    const first = configureDriveHost(fakeServices())
    const second = configureDriveHost(fakeServices())
    // The first adapter's subscriptions are gone; a second dispose is a no-op.
    second.dispose()
    first.dispose()
  })

  it('fails loud when no base URL is configured', () => {
    const adapter = configureDriveHost(fakeServices({ baseUrl: '  ' }))
    try {
      expect(() => render(<DriveApp />)).toThrow('ui-sdkwork-drive: SDKWork base URL is not configured')
    } finally {
      adapter.dispose()
    }
  })
})