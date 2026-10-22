/**
 * Failure containment for the embedded SDKWork Course surface.
 *
 * The course app is one large embedded surface rendered inside the frame's
 * `mode.page` slot. Without a boundary of its own, a render failure in any
 * course page — the catalog, a lesson, or the creator studio — reaches the
 * host's slot boundary and replaces the whole center column with an empty
 * crash marker, so the mode looks blank and only the console names the slot.
 * This boundary keeps the mode page mounted, reports the failure, and mounts
 * the surface again on retry. Host wiring failures (a missing adapter or an
 * unconfigured gateway) stay outside it and still fail loud.
 */
import { Component, type ReactNode } from 'react'
import css from './CourseSurfaceBoundary.module.css'

/** Locale-owned copy for the contained failure surface. */
export interface CourseSurfaceFailureLabels {
  /** Heading naming the failed surface. */
  readonly title: string
  /** Supporting copy telling the reader what to do next. */
  readonly detail: string
  /** Retry button label. */
  readonly retry: string
}

/** Boundary props: the failure copy and the embedded surface it protects. */
export interface CourseSurfaceBoundaryProps {
  /** Copy rendered instead of the crashed surface. */
  readonly labels: CourseSurfaceFailureLabels
  /** The embedded course surface. */
  readonly children: ReactNode
}

/** Boundary state: whether the surface failed and how many retries ran. */
interface CourseSurfaceBoundaryState {
  /** Whether the current surface generation failed. */
  readonly failed: boolean
  /** Remount generation; every retry mounts the surface from scratch. */
  readonly attempt: number
}

/**
 * Contain a crash of the embedded course surface inside the mode page.
 */
export class CourseSurfaceBoundary extends Component<
  CourseSurfaceBoundaryProps,
  CourseSurfaceBoundaryState
> {
  override state: CourseSurfaceBoundaryState = { failed: false, attempt: 0 }

  /**
   * Switch to the failure face for the rest of this surface generation.
   * @returns the state patch React applies before the failure render.
   */
  static getDerivedStateFromError(): Pick<CourseSurfaceBoundaryState, 'failed'> {
    return { failed: true }
  }

  /**
   * Report the contained failure; the failure face keeps the detail out of the page.
   * @param error - what the embedded surface threw.
   */
  override componentDidCatch(error: unknown): void {
    console.error('ui-sdkwork-course: the embedded course surface crashed:', error)
  }

  /** Mount a fresh surface generation after a failure. */
  private readonly retry = (): void => {
    this.setState(state => ({ failed: false, attempt: state.attempt + 1 }))
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <section className={css.failure} role="alert">
          <h2 className={css.title}>{this.props.labels.title}</h2>
          <p className={css.detail}>{this.props.labels.detail}</p>
          <button type="button" className={css.retry} onClick={this.retry}>
            {this.props.labels.retry}
          </button>
        </section>
      )
    }
    return (
      <div className={css.surface} key={this.state.attempt}>
        {this.props.children}
      </div>
    )
  }
}
