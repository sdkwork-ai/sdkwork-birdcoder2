// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { UpdateBanner, type UpdateBannerProps } from '../src/client/UpdateBanner.tsx'
import type { UpdateBannerState } from '../src/client/update-banner-store.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** A fake store instance served through the useStore prop. */
function bannerProps(
  state: UpdateBannerState,
  over: Partial<{
    download: Mock<() => void>
    install: Mock<() => void>
    openReleasePage: Mock<() => void>
    dismiss: Mock<() => void>
  }> = {},
): {
  props: UpdateBannerProps
  download: Mock<() => void>
  install: Mock<() => void>
  openReleasePage: Mock<() => void>
  dismiss: Mock<() => void>
} {
  const download = over.download ?? vi.fn()
  const install = over.install ?? vi.fn()
  const openReleasePage = over.openReleasePage ?? vi.fn()
  const dismiss = over.dismiss ?? vi.fn()
  const props = {
    useStore: <T,>(select: (snapshot: UpdateBannerState) => T): T => select(state),
    download,
    install,
    openReleasePage,
    dismiss,
  } as unknown as UpdateBannerProps
  return { props, download, install, openReleasePage, dismiss }
}

/** Fill every required store field; partials override the quiet baseline. */
function stateOf(partial: Partial<UpdateBannerState>): UpdateBannerState {
  return {
    phase: 'idle',
    canInstall: true,
    version: undefined,
    releaseName: undefined,
    releaseNotes: undefined,
    progressPercent: undefined,
    error: undefined,
    dismissedVersion: undefined,
    ...partial,
  }
}

const OFFER: UpdateBannerState = stateOf({
  phase: 'available',
  version: '0.1.0-rc.10',
  releaseName: 'dsh 0.1.0-rc.10',
  releaseNotes: '- bug fixes',
})

describe('UpdateBanner', () => {
  it.each(['idle', 'checking', 'disabled', 'installing'] as const)('renders nothing for the %s phase', (phase) => {
    const { props } = bannerProps(stateOf({ phase }))
    const { container } = render(<UpdateBanner {...props} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the offer with release notes and wires the download and release-page actions', () => {
    const { props, download, openReleasePage } = bannerProps(OFFER)
    render(<UpdateBanner {...props} />)
    expect(screen.getByText('发现新版本 v0.1.0-rc.10')).toBeDefined()
    expect(screen.getByText('更新内容')).toBeDefined()
    screen.getByText('下载更新').click()
    expect(download).toHaveBeenCalledTimes(1)
    screen.getByText('查看发布页').click()
    expect(openReleasePage).toHaveBeenCalledTimes(1)
  })

  it('offers only the release page when installer handoff is unavailable', () => {
    const { props, download, openReleasePage } = bannerProps({ ...OFFER, canInstall: false })
    render(<UpdateBanner {...props} />)
    expect(screen.queryByText('下载更新')).toBeNull()
    screen.getByText('查看发布页').click()
    expect(download).not.toHaveBeenCalled()
    expect(openReleasePage).toHaveBeenCalledTimes(1)
  })

  it('hides a dismissed offer and re-shows it for a different version', () => {
    const hiddenProps = bannerProps({ ...OFFER, dismissedVersion: OFFER.version })
    const hidden = render(<UpdateBanner {...hiddenProps.props} />)
    expect(hidden.container.innerHTML).toBe('')
    const shownProps = bannerProps({ ...OFFER, version: '0.1.0-rc.11', dismissedVersion: OFFER.version })
    const shown = render(<UpdateBanner {...shownProps.props} />)
    expect(shown.container.innerHTML).not.toBe('')
  })

  it('wires the dismiss button to the injected dismiss action', () => {
    const { props, dismiss } = bannerProps(OFFER)
    render(<UpdateBanner {...props} />)
    screen.getByRole('button', { name: '稍后再说' }).click()
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('renders download progress with a progressbar and no download button', () => {
    const { props } = bannerProps(stateOf({ ...OFFER, phase: 'downloading', progressPercent: 42 }))
    render(<UpdateBanner {...props} />)
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar.getAttribute('aria-valuenow')).toBe('42')
    expect(screen.getByText('正在下载 v0.1.0-rc.10…')).toBeDefined()
    expect(screen.getByText('42%')).toBeDefined()
    expect(screen.queryByText('下载更新')).toBeNull()
    expect(screen.queryByRole('button', { name: '稍后再说' })).toBeNull()
  })

  it('falls back to zero percent while the download reports no progress', () => {
    const { props } = bannerProps(stateOf({ ...OFFER, phase: 'downloading' }))
    render(<UpdateBanner {...props} />)
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar.getAttribute('aria-valuenow')).toBe('0')
    expect(screen.getByText('0%')).toBeDefined()
  })

  it('renders the restart prompt and wires install', () => {
    const { props, install } = bannerProps(stateOf({
      ...OFFER,
      phase: 'downloaded',
      dismissedVersion: OFFER.version,
    }))
    render(<UpdateBanner {...props} />)
    screen.getByText('重启并安装').click()
    expect(install).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '稍后再说' })).toBeNull()
  })

  it('does not offer installer handoff from a non-installable downloaded state', () => {
    const { props, install } = bannerProps(stateOf({
      ...OFFER,
      phase: 'downloaded',
      canInstall: false,
    }))
    render(<UpdateBanner {...props} />)
    expect(screen.queryByText('重启并安装')).toBeNull()
    expect(screen.getByText('查看发布页')).toBeDefined()
    expect(install).not.toHaveBeenCalled()
  })

  it('shows the driver error alongside the offer', () => {
    const { props } = bannerProps(stateOf({ ...OFFER, error: 'signature mismatch' }))
    render(<UpdateBanner {...props} />)
    expect(screen.getByText('signature mismatch')).toBeDefined()
  })
})
