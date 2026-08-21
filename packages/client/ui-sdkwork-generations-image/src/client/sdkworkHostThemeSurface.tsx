/**
 * Scoped SDKWork host theme shell: follows the harness color scheme, applies a
 * local `.dark` wrapper for tailwind descendants, and mirrors the scheme onto
 * `document.documentElement` while mounted so legacy SDKWork surfaces that read
 * the root class list stay aligned with BirdCoder appearance settings.
 *
 * Duplicated per SDKWork host adapter package because client-bundle purity
 * forbids cross-plugin value imports from ui-theme.
 */
import { useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react'
import clsx from 'clsx'

/** Resolved light/dark scheme for an embedded SDKWork surface. */
export type HostColorScheme = 'light' | 'dark'

/** Minimal host theme face passed into SDKWork host adapters. */
export interface HostThemeBridge {
  /** @returns the resolved host color scheme for the embedded surface. */
  getColorScheme(): HostColorScheme
  /** Observe resolved color-scheme changes. */
  subscribe(listener: () => void): () => void
}

/** Props for the embedded SDKWork theme shell. */
export interface SdkworkHostThemeSurfaceProps {
  /** Host theme bridge wired from the plugin apply() theme service. */
  theme: HostThemeBridge
  /** Optional `data-*` marker for tests and surface-scoped CSS. */
  surface?: string
  /** Embedded SDKWork body. */
  children?: ReactNode
  /** Optional extra class names on the shell root. */
  className?: string
}

interface DocumentThemeSnapshot {
  hadDark: boolean
  hadLightMode: boolean
  sdkColorMode: string | null
}

function readDocumentThemeSnapshot(): DocumentThemeSnapshot {
  const root = document.documentElement
  return {
    hadDark: root.classList.contains('dark'),
    hadLightMode: root.classList.contains('light-mode'),
    sdkColorMode: root.getAttribute('data-sdk-color-mode'),
  }
}

function applyDocumentColorScheme(scheme: HostColorScheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', scheme === 'dark')
  root.classList.toggle('light-mode', scheme === 'light')
  root.setAttribute('data-sdk-color-mode', scheme)
}

function restoreDocumentThemeSnapshot(snapshot: DocumentThemeSnapshot): void {
  const root = document.documentElement
  root.classList.toggle('dark', snapshot.hadDark)
  root.classList.toggle('light-mode', snapshot.hadLightMode)
  if (snapshot.sdkColorMode === null) root.removeAttribute('data-sdk-color-mode')
  else root.setAttribute('data-sdk-color-mode', snapshot.sdkColorMode)
}

/**
 * Render embedded SDKWork content under a host-managed color scheme.
 * @param props - theme bridge, optional surface marker, and children.
 * @returns the themed shell element tree.
 */
export function SdkworkHostThemeSurface({
  theme,
  surface,
  children,
  className,
}: SdkworkHostThemeSurfaceProps) {
  const readScheme = (): HostColorScheme => theme.getColorScheme()
  const colorScheme = useSyncExternalStore(theme.subscribe, readScheme, readScheme)

  useLayoutEffect(() => {
    const previous = readDocumentThemeSnapshot()
    applyDocumentColorScheme(colorScheme)
    return () => { restoreDocumentThemeSnapshot(previous) }
  }, [colorScheme])

  return (
    <div
      className={clsx(
        'flex h-full min-h-0 w-full min-w-0 flex-col',
        colorScheme === 'dark' && 'dark',
        className,
      )}
      {...(surface === undefined ? {} : { 'data-sdk-surface': surface })}
      data-sdk-color-mode={colorScheme}
    >
      {children}
    </div>
  )
}
