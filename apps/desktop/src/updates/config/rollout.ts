/**
 * Deterministic staged-rollout bucketing.
 *
 * The server also emits `stagingPercentage` in the feed, but the client decides
 * whether to *check* at all: an install outside the configured percentage keeps
 * its current version and retries on the next scheduled check. The bucket must
 * match Deploy's `sdkwork-deploy-feed::stable_bucket` byte for byte, otherwise
 * the two sides disagree about which installs are included.
 */

import { createHash } from 'node:crypto'

/**
 * Maps one installation to a stable 0..=99 bucket.
 * @param installId - Random identifier persisted once per installation.
 * @param productKey - Product the configuration belongs to.
 * @param version - Offered version, so widening a rollout keeps included installs included.
 * @returns The bucket, stable for the same (install, product, version) triple.
 */
export function stableBucket(installId: string, productKey: string, version: string): number {
  const digest = createHash('sha256').update(`${productKey}\u0000${version}\u0000${installId}`).digest()
  return (digest[0] ?? 0) % 100
}

/**
 * Whether an installation is inside a rollout percentage.
 * @param percentage - Operator-configured percentage (0..100).
 */
export function isInRollout(
  installId: string,
  productKey: string,
  version: string,
  percentage: number,
): boolean {
  if (percentage >= 100) return true
  if (percentage <= 0) return false
  return stableBucket(installId, productKey, version) < percentage
}
