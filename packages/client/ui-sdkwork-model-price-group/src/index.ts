/**
 * Pure host half for the browser-discovered model price-group UI plugin.
 *
 * The feature is browser-only: it reads and writes the signed-in user's
 * per-model account group through the CloudRouter app API using the shared IAM
 * credentials, so the Host owns no state, prompt section, or tool.
 */

/** Host plugin body; the model-menu UI lives in the browser export. */
export function apply(): void {}
