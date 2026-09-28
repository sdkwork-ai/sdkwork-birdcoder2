import { resolveAgentChatMessages } from '@sdkwork/birdcoder2-h5-agent-chat/messages/agentChatMessages'
import { resolveHostsMessages } from '@sdkwork/birdcoder2-h5-hosts/messages/hostsMessages'
import type { BirdCoder2H5ShellLabels } from '@sdkwork/birdcoder2-h5-shell'

/** Product name the fork ships; never the upstream harness name. */
export const BIRDCODER2_PRODUCT_NAME = 'BirdCoder' as const

/**
 * Aggregates capability copy into the shell's label map.
 *
 * The shell renders titles and tab labels but owns no catalog, and each
 * capability resolves its own language from the platform, so adding a
 * capability means adding its keys here — not teaching the shell a language.
 * The modules are imported by path rather than from the package root so that
 * resolving copy does not pull in the capability's screens and defeat the
 * shell's lazy route loading.
 */
export function createShellLabels(): BirdCoder2H5ShellLabels {
  const agentChat = resolveAgentChatMessages()
  const hosts = resolveHostsMessages()
  return {
    productName: BIRDCODER2_PRODUCT_NAME,
    routeLabels: {
      'route.chat': agentChat.chatTitle,
      'route.sessions': agentChat.sessionListTitle,
      'route.hosts': hosts.listTitle,
      'route.hostEnroll': hosts.enrollTitle,
    },
  }
}
