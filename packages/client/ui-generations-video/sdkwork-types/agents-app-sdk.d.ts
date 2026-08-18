/**
 * Declaration facade for the SDKWork Agents media-tool surface used by this
 * plugin. The tests project and browser bundle resolve the real package.
 */

import type { AuthTokenManager } from '@sdkwork/sdk-common'

/** One media-tool invocation response. */
export interface AgentsToolInvokeResponse {
  toolCallId: string
  status: string
  /** Tool-specific result payload; the adapter narrows the fields it reads. */
  output: Record<string, unknown>
  error?: string
  driveAsset?: { spaceId: string; nodeId: string; driveUri: string }
}

/** The generated Agents app client face consumed by this plugin. */
export interface AgentsAppClient {
  readonly ai: {
    readonly tools: {
      /**
       * Invoke one media tool by id.
       * @param toolId - the media tool id, e.g. `video.create`.
       * @param body - tool arguments and optional drive persistence flag.
       * @returns the invocation response.
       */
      invoke(toolId: string, body: { arguments: Record<string, unknown>; saveToDrive?: boolean }): Promise<AgentsToolInvokeResponse>
    }
  }
}

/** Create an Agents app client for one API base URL. */
export declare function createClient(config: {
  baseUrl: string
  tokenManager?: AuthTokenManager
}): AgentsAppClient
