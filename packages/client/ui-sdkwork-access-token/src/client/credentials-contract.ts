/**
 * The credential-persistence face the access-token dialog receives from the
 * plugin body: the durable section (DESIGN: the Host settings document under
 * `$DSH_HOME`) and the projection path the Host published for this page.
 *
 * These are plain data and callbacks so they can cross the slot injection
 * boundary; the browser never reads the credential file itself.
 */
import type {
  SaveAccessTokenCredentialsInput, SavedAccessTokenCredentials, SdkworkAccessTokenPrefill,
} from '../access-token-settings.ts'

/** The remembered-login face one dialog render consumes. */
export interface AccessTokenCredentialsFace {
  /**
   * The login the section remembers for one project.
   * @param directory - absolute project directory.
   * @returns the remembered facts, or undefined when the project has none.
   */
  read(directory: string): SdkworkAccessTokenPrefill | undefined
  /**
   * Remember one project's login.
   * @param directory - absolute project directory.
   * @param values - the login facts to persist.
   * @returns the projection path and whether the section changed.
   */
  save(directory: string, values: SaveAccessTokenCredentialsInput): Promise<SavedAccessTokenCredentials>
  /** The projection path the Host published, for the dialog's notice. */
  path(): string
}
