/**
 * The render fence around the player.
 *
 * The document body sits inside the right Sidebar's dock, so a render that
 * throws takes the whole panel with it, not just this preview. Identification
 * and control bookkeeping are written not to throw, but "written not to" is not
 * the same as "cannot": a container reader is parsing attacker-controlled bytes
 * for a living. This fence turns any remaining escape into one panel-local line
 * and a retry, so the blast radius of a malformed file is a message instead of a
 * blank Sidebar.
 *
 * The copy arrives as props rather than through `useLocale`: a class component
 * cannot subscribe to the locale seat, and the parent already has it.
 */
import { Component, Fragment, type ReactNode } from 'react'
import css from './VideoPlayer.module.css'

/** Input for the fence; every string is already translated by the parent. */
export interface VideoBoundaryProps {
  /** The line shown in place of the preview. */
  readonly message: string
  /** Label for the control that remounts the preview. */
  readonly retry: string
  readonly children: ReactNode
}

/** Whether the preview currently has a throw behind it. */
interface VideoBoundaryState {
  readonly failed: boolean
  /** Bumped on retry so the children remount instead of re-rendering in place. */
  readonly token: number
}

/** Renders its children until one of them throws, then offers a retry. */
export class VideoBoundary extends Component<VideoBoundaryProps, VideoBoundaryState> {
  override state: VideoBoundaryState = { failed: false, token: 0 }

  /**
   * Record a render failure instead of letting it reach the Sidebar.
   * @returns the state that swaps the preview for the failure line.
   */
  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true }
  }

  /** Remount the preview, which is the only recovery a render failure has. */
  private readonly retry = (): void => {
    this.setState(state => ({ failed: false, token: state.token + 1 }))
  }

  /** @returns the preview, or the failure line once a render threw. */
  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className={css.status} role="alert" data-video-crash>
          <span className={css.statusLine}>{this.props.message}</span>
          <button type="button" className={css.retry} data-video-crash-retry onClick={this.retry}>
            {this.props.retry}
          </button>
        </div>
      )
    }
    return <Fragment key={this.state.token}>{this.props.children}</Fragment>
  }
}
