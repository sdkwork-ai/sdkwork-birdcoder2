/** Shared provider display order for the composer and command model pickers. */

/**
 * Put BirdCoder, the account, and the official provider first, preserving every
 * other relative order. BirdCoder is this fork's default model provider, so it
 * leads the picker before the account and official DeepSeek routes.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
export function orderModelProviders<T extends { readonly id: string }>(groups: readonly T[]): T[] {
  const rank = (id: string): number => id === 'birdcoder' ? 0 : id === 'deepseek-account' ? 1 : id === 'deepseek-official' ? 2 : 3
  return groups.toSorted((left, right) => rank(left.id) - rank(right.id))
}
