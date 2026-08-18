/**
 * Declaration facade for the SDKWork Agents media-tool and assets surface
 * used by this plugin. The tests project and browser bundle resolve the real
 * package.
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

/** One generated media asset persisted to Drive. */
export interface ToolAssetView {
  /** The media tool id that produced the asset. */
  toolId: string
  /** The tool invocation id that produced the asset. */
  toolCallId: string
  /** The media kind reported by the tool output. */
  mediaKind: string
  /** The Drive space id holding the asset. */
  driveSpaceId: string
  /** The Drive node id holding the asset. */
  driveNodeId: string
  /** The canonical Drive URI of the persisted asset. */
  driveUri: string
  /** The original provider media URL from the tool result, when still present. */
  sourceUrl?: string
  /** RFC3339 creation time of the asset record, when reported. */
  createdAt?: string
}

/** The generated Agents app client face consumed by this plugin. */
export interface AgentsAppClient {
  readonly ai: {
    readonly agents: {
      readonly tools: {
        /**
         * Invoke one media tool by id.
         * @param toolId - the media tool id, e.g. `image.generations.create`.
         * @param body - tool arguments and optional drive persistence flag.
         * @returns the invocation response.
         */
        invoke(toolId: string, body: { arguments: Record<string, unknown>; saveToDrive?: boolean }): Promise<AgentsToolInvokeResponse>
      }
      readonly assets: {
        /**
         * List generated media assets persisted to Drive.
         * @returns the asset list.
         */
        list(): Promise<ToolAssetView[]>
      }
    }
  }
}

/** Create an Agents app client for one API base URL. */
export declare function createClient(config: {
  baseUrl: string
  tokenManager?: AuthTokenManager
}): AgentsAppClient
