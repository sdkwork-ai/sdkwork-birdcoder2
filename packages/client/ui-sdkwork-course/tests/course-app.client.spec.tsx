// @vitest-environment jsdom
/**
 * CourseApp integration spec: configures the real SDKWork host adapter and
 * mounts the Course surface.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import {
  configureCourseHost,
  CourseApp,
  type CourseHostEnvironment,
  type CourseHostIam,
  type CourseHostLocale,
  type CourseHostTheme,
} from '../src/client/courseHost.ts'

function fakeServices(overrides: { baseUrl?: string; colorScheme?: 'light' | 'dark' } = {}) {
  let environmentListener: (() => void) | undefined
  const env: CourseHostEnvironment = {
    apiBaseUrl: () => overrides.baseUrl ?? 'https://fixture.example',
    accessToken: () => '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam: CourseHostIam = {
    controller: {
      getState: () => ({
        session: {
          accessToken: 'session-access',
          user: { displayName: 'Ada' },
        },
      }),
      subscribe: () => () => {},
    },
  }
  const locale: CourseHostLocale = {
    getSnapshot: () => ({ active: 'zh' }),
    subscribe: () => () => {},
  }
  const theme: CourseHostTheme = {
    getColorScheme: () => overrides.colorScheme ?? 'dark',
    subscribe: () => () => {},
  }
  return { env, iam, locale, theme, fireEnvironment: () => { environmentListener?.() } }
}

describe('CourseApp', () => {
  it('mounts the SDKWork surface through the configured host ports', () => {
    const services = fakeServices()
    const adapter = configureCourseHost(services)
    try {
      const { container } = render(<CourseApp />)
      expect(container.querySelector('[data-sdk-surface="course"]')).not.toBeNull()
    } finally {
      adapter.dispose()
    }
  })

  it('fails loud when no host adapter was configured', () => {
    expect(() => render(<CourseApp />)).toThrow('ui-sdkwork-course: SDKWork host runtime is not configured')
  })
})
