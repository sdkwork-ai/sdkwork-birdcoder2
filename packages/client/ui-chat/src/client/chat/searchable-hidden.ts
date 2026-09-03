import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Apply searchable hidden state without unmounting a stable subtree.
 * @param hidden - whether the subtree is currently hidden.
 * @param reveal - callback for browser find's `beforematch` reveal.
 * @returns ref for the stable subtree root.
 */
export function useSearchableHidden(
  hidden: boolean,
  reveal: () => void,
): RefObject<HTMLDivElement | null> {
  // react 19 types: useRef with a null initial returns RefObject<T | null>;
  // both call sites only pass this through the JSX `ref` prop, which accepts
  // the nullable form.
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    if (hidden && element.contains(element.ownerDocument.activeElement)) {
      reveal()
      return
    }
    if (hidden) element.setAttribute('hidden', 'until-found')
    else element.removeAttribute('hidden')
  }, [hidden, reveal])
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    element.addEventListener('beforematch', reveal)
    return () => { element.removeEventListener('beforematch', reveal) }
  }, [reveal])
  return ref
}
