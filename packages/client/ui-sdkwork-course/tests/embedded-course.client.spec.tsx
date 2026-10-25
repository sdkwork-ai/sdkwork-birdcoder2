// @vitest-environment jsdom
/**
 * Embedded course surface: the host chrome mounts the new discovery pages, not
 * the legacy dark catalog. These specs pin the embedded router entry, the
 * infinite-scroll home feed, and the host-only fallback routes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CourseAppSdkClient } from '@sdkwork/sdkwork-course-pc-core'
import { EmbeddedCourseApp } from '../src/client/EmbeddedCourse.tsx'

/** jsdom has no IntersectionObserver; the stub records the sentinel callback so
 * specs can simulate the feed bottom scrolling into the viewport. */
class IntersectionObserverStub {
  static latest: IntersectionObserverStub | null = null
  private readonly callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    IntersectionObserverStub.latest = this
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  /** Fire the observed callback as if the sentinel entered the viewport. */
  intersect(): void {
    this.callback(
      [{ isIntersecting: true, target: document.body } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

interface CoursePageRequest {
  page?: number
  pageSize?: number
}

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

/** A client whose catalog spans multiple pages, for the home infinite scroll. */
function pagedClient(totalCourses: number): CourseAppSdkClient {
  const courses = Array.from({ length: totalCourses }, (_, index) => ({
    id: `course-${index + 1}`,
    title: `课程 ${index + 1}`,
    kind: 'standard',
  }))
  const base = fakeClient()
  return {
    ...base,
    courses: {
      ...base.courses,
      list: async (request: CoursePageRequest) => {
        const size = request.pageSize ?? 30
        const pageNo = Math.max(1, request.page ?? 1)
        return {
          items: courses.slice((pageNo - 1) * size, pageNo * size),
          pageInfo: { totalItems: courses.length, page: pageNo, pageSize: size },
        }
      },
    },
  } as unknown as CourseAppSdkClient
}

describe('EmbeddedCourseApp', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    IntersectionObserverStub.latest = null
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

  it('loads further home-feed pages as the sentinel scrolls into view', async () => {
    // 45 courses against the page size of 30: page 2 exists and is not preloaded.
    render(<EmbeddedCourseApp client={pagedClient(45)} />)
    expect(await screen.findByText('课程 30')).toBeTruthy()
    expect(screen.queryByText('课程 31')).toBeNull()

    IntersectionObserverStub.latest?.intersect()
    expect(await screen.findByText('课程 31')).toBeTruthy()
    expect(screen.getByText('已加载全部课程')).toBeTruthy()
  })

  it('drops the creator upload card from the home feed', async () => {
    render(<EmbeddedCourseApp client={pagedClient(45)} />)
    await screen.findByText('课程 30')
    expect(screen.queryByText('把你的经验，变成一门课')).toBeNull()
    expect(screen.queryByText('上传封面与课时，编排章节或合集，提交平台审核后发布。')).toBeNull()
    expect(screen.getAllByText('上传课程').length).toBeGreaterThan(0)
  })

  it('loads further catalog pages as the sentinel scrolls into view', async () => {
    render(<EmbeddedCourseApp client={pagedClient(24)} initialPath="/courses?category=cat-1" />)
    // The list page loads twelve per page; page 2 stays unloaded until the sentinel.
    expect(await screen.findByText('课程 12')).toBeTruthy()
    expect(screen.queryByText('课程 13')).toBeNull()
    expect(screen.queryByText('上一页')).toBeNull()

    IntersectionObserverStub.latest?.intersect()
    expect(await screen.findByText('课程 24')).toBeTruthy()
    expect(screen.getByText('已加载全部课程')).toBeTruthy()
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
