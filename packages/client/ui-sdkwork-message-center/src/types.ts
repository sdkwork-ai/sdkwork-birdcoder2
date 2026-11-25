/** Message-center plugin configuration shared by the Host and Client faces; types only. */
import type { Volatile } from '@deepseek-ai/cordis'

/** Runtime settings; the browser receives them through its synced Config. */
export interface MessageCenterConfig {
  /** Unread-badge polling interval in milliseconds. */
  pollIntervalMs: Volatile<number>
  /** Notifications requested per page from the app notification API. */
  pageSize: Volatile<number>
}
