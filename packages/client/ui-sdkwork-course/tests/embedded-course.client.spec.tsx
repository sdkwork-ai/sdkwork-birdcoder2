// @vitest-environment jsdom
/**
 * Embedded course surface: the host chrome mounts the new discovery pages, not
 * the legacy dark catalog. These specs pin the embedded router entry and the
 * host-only fallback routes.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CourseAppSdkClient } from '@sdkwork/sdkwork-course-pc-core'
import { EmbeddedCourseApp } from '../src/client/EmbeddedCourse.tsx'

function fakeClient(): CourseAppSdkClient {
  const page = async () => ({ items: [], pageInfo: { totalItems: 0, page: 1, pageSize: 20 } })
  return {
    courses: {
      list: page,
      retrieve: async () => {
        throw new Error('not found')
      },
      collectionItems: page,
    },
    courseCategories: { list: page },
    courseCurriculum: {
      retrieve: async () => {
        throw new Error('not found')
      },
    },
    courseOfferings: { list: page },
    courseEnrollments: {
      list: page,
      current: { list: page },
      create: async () => ({ id: 'enrollment' }),
    },
    courseLiveSessions: {
      list: page,
      retrieve: async () => ({ id: 'live' }),
      join: async () => ({ item: {} }),
      heartbeat: async () => ({}),
      leave: async () => ({}),
      replay: { retrieve: async () => null },
    },
  } as unknown as CourseAppSdkClient
}

describe('EmbeddedCourseApp', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the discovery surface with its host search bar', async () => {
    const { container } = render(<EmbeddedCourseApp client={fakeClient()} />)
    expect(container.querySelector('[data-course-embedded="sdkwork"]')).not.toBeNull()
    expect(screen.getAllByText('课程中心').length).toBeGreaterThan(0)
    expect(await screen.findByText('课程正在准备中')).toBeTruthy()

    const input = screen.getByLabelText('搜索课程、专栏、合集')
    fireEvent.change(input, { target: { value: 'AI' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    await waitFor(() => expect(container.textContent).toContain('课程中心'))
  })

  it('opens the full catalog from an empty search', async () => {
    render(<EmbeddedCourseApp client={fakeClient()} />)
    const input = screen.getByLabelText('搜索课程、专栏、合集')
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    await waitFor(() => expect(screen.getAllByText('课程中心').length).toBeGreaterThan(0))
  })

  it('offers the UGC upload entry in the embedded surface', async () => {
    render(<EmbeddedCourseApp client={fakeClient()} />)
    await screen.findByText('课程正在准备中')
    expect(screen.getAllByText('上传课程').length).toBeGreaterThan(0)
  })

  it('renders the host fallback for /admin', () => {
    render(<EmbeddedCourseApp client={fakeClient()} initialPath="/admin" />)
    expect(screen.getByRole('heading', { name: '运营后台' })).toBeTruthy()
  })

  it('renders the live classroom entry', async () => {
    render(<EmbeddedCourseApp client={fakeClient()} initialPath="/live" />)
    expect(await screen.findByRole('heading', { name: '直播课堂' })).toBeTruthy()
  })
})
