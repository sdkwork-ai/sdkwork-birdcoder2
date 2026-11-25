import { useRef, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import css from './MarketplaceTabs.module.css'

/** One selectable entry in a shared marketplace tab list. */
export interface MarketplaceTab<T extends string> {
  readonly id: T
  readonly label: ReactNode
  readonly icon?: ComponentType<ModeIconProps>
}

/** Props for the controlled marketplace tab list. */
export interface MarketplaceTabsProps<T extends string> {
  readonly tabs: readonly MarketplaceTab<T>[]
  readonly selected: T
  readonly ariaLabel: string
  readonly onSelect: (id: T) => void
}

/** Shared, keyboard-navigable tab strip used by marketplace category roots. */
export function MarketplaceTabs<T extends string>({
  tabs, selected, ariaLabel, onSelect,
}: MarketplaceTabsProps<T>) {
  const tabList = useRef<HTMLDivElement>(null)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
    const currentIndex = buttons.indexOf(event.target as HTMLButtonElement)
    if (currentIndex < 0 || buttons.length === 0) return

    event.preventDefault()
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    const nextTab = tabs[nextIndex]
    if (nextTab === undefined) return
    buttons[nextIndex]?.focus()
    onSelect(nextTab.id)
  }

  return (
    <div ref={tabList} className={css.tabs} role="tablist" aria-label={ariaLabel} onKeyDown={handleKeyDown}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          className={selected === id ? `${css.tab} ${css.tabActive}` : css.tab}
          aria-selected={selected === id}
          tabIndex={selected === id ? 0 : -1}
          data-market-tab={id}
          onClick={() => { onSelect(id) }}
        >
          {Icon !== undefined && <Icon size={14} className={css.tabIcon} />}
          {label}
        </button>
      ))}
    </div>
  )
}
