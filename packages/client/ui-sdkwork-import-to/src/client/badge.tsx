/**
 * The two-letter target mark.
 *
 * The catalog carries no third-party brand artwork, so every row shows the
 * same tile with its own initials and colour.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import type { ReactElement } from 'react'
import type { TargetDescriptor } from './types.ts'

/**
 * Coloured initials tile.
 * @param props - target whose badge is rendered.
 * @returns the tile.
 */
export function TargetBadge({ target }: { readonly target: TargetDescriptor }): ReactElement {
  return (
    <span
      data-import-to-badge={target.id}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        marginRight: 8,
        borderRadius: 4,
        background: target.badge.color,
        color: '#fff',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.02em',
        flex: '0 0 auto',
      }}
    >
      {target.badge.initials}
    </span>
  )
}
