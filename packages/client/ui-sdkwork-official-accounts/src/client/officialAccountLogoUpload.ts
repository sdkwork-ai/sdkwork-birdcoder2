/**
 * Application upload declaration for the official-account logo field.
 *
 * Authority: `DRIVE_SPEC.md` section 18 (Application Upload Declaration
 * Contract). The declared values live in `specs/upload.declaration.json` at
 * this repository's application root — the DSH BirdCoder client is the
 * application whose `agent.app.config.json` names the runtime identity every
 * Drive request authenticates as. This module carries those values into code so
 * the upload service references one constant instead of repeating literals; the
 * two MUST stay identical.
 */
import type { DriveUploadImageDeclaration } from '@sdkwork/drive-upload-image-core'

/** The official-account logo upload purpose declared for this application. */
export const OFFICIAL_ACCOUNT_LOGO_UPLOAD = {
  appResourceType: 'iam.official_account_logo',
  appResourceIdKind: 'entity',
  scene: 'official-account-logo',
  source: 'birdcoder-pc-official-account-logo-upload',
  uploadProfileCode: 'image',
  retention: 'long_term',
  purpose: 'Official (公众号) account logo uploaded from the account settings dialog and attached to the account record.',
} as const satisfies DriveUploadImageDeclaration
