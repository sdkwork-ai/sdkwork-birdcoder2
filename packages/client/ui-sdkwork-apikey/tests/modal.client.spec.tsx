// @vitest-environment jsdom
/**
 * The API-key modal's embed scope: the attributes the plugin's compiled
 * stylesheet is scoped to (see src/client/embedScope.ts and the containment
 * wrap in tsdown.config.ts).
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeysModal, type ApiKeysModalProps } from '../src/client/ApiKeysModal.tsx'
import { APIKEY_EMBED_ATTRIBUTE, APIKEY_EMBED_PORTAL_ATTRIBUTE } from '../src/client/embedScope.ts'

// The embedded console view resolves its own React and react-i18next copies
// from the sibling checkout, two instances this source-plane lane cannot share
// with the package's React. This spec pins the modal's own scope attributes,
// so the view is stubbed.
vi.mock('@sdkwork/cloudrouter-pc-console-api-keys', () => ({
  ApiKeysView: () => <div data-console-api-keys-view="true" />,
}))

const t = ((key: string) => key) as ApiKeysModalProps['t']

/**
 * Locale face double. The snapshot is created once: `useSyncExternalStore`
 * re-renders until two consecutive reads return the same reference, so a fresh
 * object per call would loop.
 */
function locale(active = 'zh'): ApiKeysModalProps['locale'] {
  const snapshot = { active }
  return { getSnapshot: () => snapshot, subscribe: () => () => {} }
}

/** Host double: the modal reads only readiness from the adapter. */
function host(readReady: boolean): ApiKeysModalProps['host'] {
  return { readReady: () => readReady } as ApiKeysModalProps['host']
}

function view(props: Partial<ApiKeysModalProps> = {}) {
  return (
    <ApiKeysModal
      open
      onClose={() => {}}
      host={host(false)}
      locale={locale()}
      t={t}
      {...props}
    />
  )
}

afterEach(() => {
  cleanup()
  document.body.removeAttribute(APIKEY_EMBED_PORTAL_ATTRIBUTE)
})

describe('ApiKeysModal embed scope', () => {
  it('renders nothing and leaves the document unmarked while closed', () => {
    const { container } = render(view({ open: false }))
    expect(container.querySelector(`[${APIKEY_EMBED_ATTRIBUTE}]`)).toBeNull()
    expect(document.body.hasAttribute(APIKEY_EMBED_PORTAL_ATTRIBUTE)).toBe(false)
  })

  it('reports host readiness on the same embed root, which mounts the view', () => {
    const { container } = render(view({ host: host(true) }))
    expect(container.querySelector(`[${APIKEY_EMBED_ATTRIBUTE}]`)?.getAttribute(APIKEY_EMBED_ATTRIBUTE))
      .toBe('ready')
    expect(container.querySelector('[data-console-api-keys-view]')).not.toBeNull()
  })

  it('marks the body for the modal lifetime so the view body-portals are in scope', () => {
    const { rerender } = render(view())
    expect(document.body.hasAttribute(APIKEY_EMBED_PORTAL_ATTRIBUTE)).toBe(true)
    rerender(view({ open: false }))
    expect(document.body.hasAttribute(APIKEY_EMBED_PORTAL_ATTRIBUTE)).toBe(false)
  })

  it('clears the body mark when the modal unmounts while open', () => {
    const { unmount } = render(view())
    expect(document.body.hasAttribute(APIKEY_EMBED_PORTAL_ATTRIBUTE)).toBe(true)
    unmount()
    expect(document.body.hasAttribute(APIKEY_EMBED_PORTAL_ATTRIBUTE)).toBe(false)
  })

  it('closes on Escape and on a mask click', () => {
    const onClose = vi.fn()
    const { container, unmount } = render(view({ onClose }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
    const mask = container.querySelector('[aria-hidden="true"]')
    expect(mask).not.toBeNull()
    fireEvent.click(mask as Element)
    expect(onClose).toHaveBeenCalledTimes(2)
    unmount()
  })
})
