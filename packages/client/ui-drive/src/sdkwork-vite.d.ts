/** Vite environment values read by the embedded SDKWork Drive application. */
interface ImportMetaEnv {
  readonly DEV?: boolean
  readonly PROD?: boolean
  readonly MODE?: string
  readonly VITE_DRIVE_PC_DEPLOYMENT_PROFILE?: string
  readonly VITE_DRIVE_PC_RUNTIME_TARGET?: string
  readonly VITE_DRIVE_PC_TOKEN_MANAGER_MODE?: string
  readonly VITE_DRIVE_PC_TOKEN_STORAGE?: string
  readonly [key: string]: unknown
}

/** Import metadata available while bundling the SDKWork application. */
interface ImportMeta {
  readonly env: ImportMetaEnv
}
