// @vitest-environment jsdom
/**
 * Course surface boundary spec: a crashed embedded course surface renders the
 * failure face instead of escaping to the host's `mode.page` slot boundary.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  CourseSurfaceBoundary,
  type CourseSurfaceFailureLabels,
} from '../src/client/CourseSurfaceBoundary.tsx'

const LABELS: CourseSurfaceFailureLabels = {
  title: 'The course page could not load',
  detail: 'Retry once; if it keeps failing, share the console message.',
  retry: 'Retry',
}

const CRASH_MESSAGE = 'ui-sdkwork-course: the embedded course surface crashed:'

describe('CourseSurfaceBoundary', () => {
  it('renders the embedded surface while it is healthy', () => {
    const { getByText, queryByRole } = render(
      <CourseSurfaceBoundary labels={LABELS}>
        <p>healthy course</p>
      </CourseSurfaceBoundary>,
    )
    expect(getByText('healthy course')).toBeTruthy()
    expect(queryByRole('alert')).toBeNull()
  })

  it('contains a crash, reports it, and remounts the surface on retry', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let crash = true
    function MaybeCrash(): ReactNode {
      if (crash) throw new Error('course boom')
      return <p>recovered course</p>
    }
    try {
      const { getByText, getByRole, queryByText } = render(
        <CourseSurfaceBoundary labels={LABELS}>
          <MaybeCrash />
        </CourseSurfaceBoundary>,
      )
      expect(getByRole('alert')).toBeTruthy()
      expect(getByText(LABELS.title)).toBeTruthy()
      expect(getByText(LABELS.detail)).toBeTruthy()
      expect(queryByText('recovered course')).toBeNull()
      expect(consoleError).toHaveBeenCalledWith(CRASH_MESSAGE, expect.any(Error))

      crash = false
      fireEvent.click(getByRole('button', { name: LABELS.retry }))
      expect(getByText('recovered course')).toBeTruthy()
      expect(queryByText(LABELS.title)).toBeNull()
    } finally {
      consoleError.mockRestore()
    }
  })
})
