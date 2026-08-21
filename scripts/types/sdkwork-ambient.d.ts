/**
 * Ambient declarations for the SDKWork sibling workspace packages.
 *
 * The sdkwork-* repositories are independent checkouts composed into this
 * workspace. Their latest sources carry their own type state; this fork does
 * not modify them, so the tests projects resolve every `@sdkwork/*` import
 * through this ambient face instead of pulling the sibling sources into the
 * typecheck program. Keep this file minimal: it exists so the fork's own
 * typecheck stays green against the siblings' current state.
 */
declare module '@sdkwork/*' {
  const value: unknown
  export default value
}

declare module '@sdkwork/*/*' {
  const value: unknown
  export default value
}
