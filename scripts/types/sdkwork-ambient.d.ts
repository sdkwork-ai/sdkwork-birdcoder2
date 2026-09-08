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

// The ui-sdkwork-apikey embed stubs monaco's worker entries at bundle time
// (tsdown.config.ts aliases them to a throwing stub; the editor degrades to a
// read-only <pre> when the dynamic core import fails). Vite's `?worker`
// suffix is not a resolvable module for the type side, so the default export
// is the worker constructor shape the `?worker` import contract provides.
declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
  const workerConstructor: new () => Worker
  export default workerConstructor
}

declare module 'monaco-editor/esm/vs/language/json/json.worker?worker' {
  const workerConstructor: new () => Worker
  export default workerConstructor
}
