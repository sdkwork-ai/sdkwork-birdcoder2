/**
 * Scoped theme shell for the sdkwork-iam auth surfaces. Auth CSS and Tailwind
 * `dark:` utilities key off a local `.dark` ancestor and `data-sdk-color-mode`;
 * this frame also mirrors the harness scheme onto `document.documentElement`
 * while mounted so overlay login stays aligned with BirdCoder appearance.
 */
import { useLayoutEffect, type ReactNode } from 'react'
import clsx from 'clsx'
import './sdkwork-auth.module.css'

/** Props for the IAM auth theme shell. */
export interface SdkworkAuthThemeFrameProps {
  /** Resolved harness color scheme. */
  colorScheme: 'light' | 'dark'
  /** Optional `data-sdk-surface` marker for tests. */
  surface?: string
  /** Auth page, modal, or notice. */
  children: ReactNode
  /** Extra class names on the shell root. */
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

function applyDocumentColorScheme(scheme: 'light' | 'dark'): void {
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
 * Wrap IAM auth content so light/dark tokens and Tailwind `dark:` variants
 * follow the harness color scheme.
 * @param props - color scheme, optional surface marker, and children.
 * @returns the themed shell element tree.
 */
export function SdkworkAuthThemeFrame({
  colorScheme,
  surface,
  children,
  className,
}: SdkworkAuthThemeFrameProps) {
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
