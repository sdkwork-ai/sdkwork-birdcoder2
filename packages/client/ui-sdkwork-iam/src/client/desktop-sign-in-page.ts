/**
 * The product sign-in page bridge.
 *
 * The desktop shell exposes `window.dshDesktop.auth.openSignIn()`: it shows the
 * same welcome window a signed-out launch shows, over the running workspace,
 * and resolves with the gesture the page ended with. The page never holds
 * tokens — `'login'` asks the workspace to start the IAM browser login itself,
 * `'credential'` means the user stored an API key, and `'dismissed'` means no
 * authentication gesture happened. A plain browser page exposes no bridge, so
 * the IAM modal the settings menu uses stays the fallback surface.
 */

/** The gesture a desktop welcome sign-in page ended with. */
export type DesktopSignInOutcome = 'login' | 'credential' | 'dismissed'

/** One product sign-in page the workspace can open. */
export interface DesktopSignInPage {
  /**
   * Show the page and wait for the gesture.
   * @returns the gesture the page ended with.
   */
  open(): Promise<DesktopSignInOutcome>
}

/** The preload global that carries the product API. */
interface DshDesktopGlobal {
  readonly dshDesktop?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the validated sign-in page from the page globals.
 * @returns the page handle, or undefined outside the desktop shell.
 */
export function readDesktopSignInPage(): DesktopSignInPage | undefined {
  const candidate = (globalThis as DshDesktopGlobal).dshDesktop
  if (!isRecord(candidate)) return undefined
  const auth = candidate.auth
  if (!isRecord(auth)) return undefined
  const openSignIn = auth.openSignIn
  if (typeof openSignIn !== 'function') return undefined
  // The page global is foreign input: bind the function to the object that
  // exposed it and narrow the result here rather than trusting the bridge.
  return {
    open: async () => {
      const value: unknown = await Reflect.apply(openSignIn, auth, [])
      return value === 'login' || value === 'credential' ? value : 'dismissed'
    },
  }
}
