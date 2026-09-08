/**
 * Monaco worker stub for the ui-sdkwork-apikey embed bundle.
 *
 * The usage-details config editor degrades to a read-only <pre> when the
 * monaco-editor dynamic import fails (see ConfigCodeEditor.tsx), so the
 * workers are never constructed in this embed — the stub only satisfies the
 * static `?worker` import specifiers at bundle time without dragging the
 * monaco core into the plugin bundle.
 */
export default function monacoWorkerStub(): never {
  throw new Error('monaco workers are not bundled in the ui-sdkwork-apikey embed')
}
