/**
 * SDKWork Course surface embedded in the BirdCoder Course mode.
 *
 * The host already supplies the app frame, rail, session, and theme, so this
 * component owns only the course content: a memory router, the host-built SDK
 * client, and the learner pages. It deliberately renders the light discovery
 * surface from the SDKWork Course PC package instead of the legacy dark
 * catalog, so the integrated plugin matches the standalone course center.
 */
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  CourseSdkProvider,
  type CourseAppSdkClient,
} from '@sdkwork/sdkwork-course-pc-core'
import {
  CourseDetailPage,
  CourseListPage,
  HomePage,
} from '@sdkwork/sdkwork-course-pc-courses'
import { LessonPlayerPage } from '@sdkwork/sdkwork-course-pc-lessons'
import { LiveSessionDetailPage, LiveSessionListPage } from '@sdkwork/sdkwork-course-pc-live'
import { MyLearningPage } from '@sdkwork/sdkwork-course-pc-progress'
import {
  StudioCourseEditorPage,
  StudioCourseListPage,
  StudioQueryBoundary,
} from '@sdkwork/sdkwork-course-pc-studio'

/** Props for the embedded host surface. */
export interface EmbeddedCourseAppProps {
  /** Client built by the host adapter with the host base URL and token manager. */
  client: CourseAppSdkClient
  /** Optional deep link used by host tests and future mode entry points. */
  initialPath?: string
}

function HostUnavailable({ title, detail }: { title: string; detail: string }): ReactNode {
  return (
    <section className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{detail}</p>
    </section>
  )
}

function EmbeddedTopBar(): ReactNode {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [searchValue, setSearch] = useState('')
  const kind = new URLSearchParams(search).get('kind') ?? ''
  const courseActive =
    pathname.startsWith('/courses') && kind !== 'column' && kind !== 'collection'
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchValue.trim()
    navigate(query ? `/courses?q=${encodeURIComponent(query)}` : '/courses')
  }
  const navItems = [
    { label: '首页', to: '/', active: pathname === '/' },
    { label: '课程中心', to: '/courses', active: courseActive },
    { label: '专栏', to: '/courses?kind=column', active: kind === 'column' },
    { label: '合集', to: '/courses?kind=collection', active: kind === 'collection' },
    { label: '直播', to: '/live', active: pathname === '/live' },
  ]
  return (
    <header className="w-full border-b border-slate-200 bg-white">
      <div className="flex items-center gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-black text-white shadow-sm">
            课
          </span>
          <span className="block text-base font-bold leading-tight text-slate-900">课程中心</span>
        </Link>
        <nav className="hidden shrink-0 items-center gap-1 lg:flex">
          {navItems.map(item => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={item.active ? 'page' : undefined}
              className={
                item.active
                  ? 'rounded-full bg-indigo-50 px-3.5 py-1.5 text-[13px] font-semibold text-indigo-600'
                  : 'rounded-full px-3.5 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form onSubmit={submit} className="relative mx-auto hidden w-full max-w-[420px] flex-1 md:block">
          <input
            value={searchValue}
            onChange={event => setSearch(event.target.value)}
            placeholder="搜索课程、专栏、合集"
            aria-label="搜索课程、专栏、合集"
            className="h-9 w-full rounded-full border border-slate-200 bg-slate-100/80 pl-4 pr-10 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
          />
          <button
            type="submit"
            aria-label="搜索"
            className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-indigo-600"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
          </button>
        </form>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/studio"
            className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
          >
            创作者中心
          </Link>
          <Link
            to="/studio?create=1"
            className="inline-flex h-9 items-center rounded-full bg-[#fb7299] px-4 text-[13px] font-semibold text-white transition hover:bg-[#e55d83]"
          >
            上传课程
          </Link>
          <Link
            to="/my"
            className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
          >
            我的学习
          </Link>
        </div>
      </div>
    </header>
  )
}

function EmbeddedCourseContent(): ReactNode {
  const { pathname } = useLocation()
  const fullBleedCourseSurface =
    /^\/courses\/[^/]+(?:\/play|\/learn\/[^/]+)?$/.test(pathname)

  return (
    <div className="w-full">
      <EmbeddedTopBar />
      <div
        className={
          fullBleedCourseSurface
            ? 'w-full px-2 py-2 sm:px-3'
            : 'mx-auto w-full max-w-[1760px] px-4 py-3 sm:px-6'
        }
      >
        <Routes>
          <Route path="/" element={<HomePage embedded />} />
          <Route path="/courses" element={<CourseListPage embedded />} />
          <Route path="/courses/:courseId/play" element={<LessonPlayerPage />} />
          <Route path="/courses/:id" element={<CourseDetailPage embedded />} />
          <Route
            path="/courses/:courseId/learn/:lessonId"
            element={<LessonPlayerPage />}
          />
          <Route path="/my" element={<MyLearningPage />} />
          <Route
            path="/studio"
            element={
              <StudioQueryBoundary>
                <StudioCourseListPage />
              </StudioQueryBoundary>
            }
          />
          <Route
            path="/studio/courses/:id"
            element={
              <StudioQueryBoundary>
                <StudioCourseEditorPage />
              </StudioQueryBoundary>
            }
          />
          <Route path="/live" element={<LiveSessionListPage />} />
          <Route path="/live/:id" element={<LiveSessionDetailPage />} />
          <Route
            path="/admin"
            element={
              <HostUnavailable
                title="运营后台"
                detail="审核与课程治理请使用独立课程工作台的运营后台，避免在宿主内暴露高权限操作。"
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

/**
 * Render the learner course surface inside a host chrome.
 * @param props - host SDK client and optional initial route.
 * @returns the embedded course app.
 */
export function EmbeddedCourseApp({ client, initialPath = '/' }: EmbeddedCourseAppProps): ReactNode {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
    [],
  )

  return (
    <CourseSdkProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <div
            data-course-embedded="sdkwork"
            className="course-app-surface h-full min-h-0 overflow-y-auto"
          >
            <EmbeddedCourseContent />
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    </CourseSdkProvider>
  )
}
