/** Vite environment values read by the embedded SDKWork Knowledge Base application. */
interface ImportMetaEnv {
  readonly DEV?: boolean
  readonly PROD?: boolean
  readonly MODE?: string
  readonly VITE_SDKWORK_KNOWLEDGEBASE_HOST_RUNTIME_TARGET?: string
  readonly VITE_SDKWORK_KNOWLEDGEBASE_HOST_PRESENTATION_MODE?: string
  readonly VITE_SDKWORK_KNOWLEDGEBASE_HOST_EMBED_URL?: string
  readonly [key: string]: unknown
}

/** Import metadata available while bundling the SDKWork application. */
interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const workerUrl: string
  export default workerUrl
}
