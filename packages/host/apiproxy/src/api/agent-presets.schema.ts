/**
 * agent-presets domain zod schemas (names derived from map keys:
 * agentPresetListRequestSchema / agentPresetListValueSchema).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import { sessionIdSchema } from './sessions.schema.ts'
import type { AgentPresetEntry } from './agent-presets.ts'

/** AgentPresetEntry row of agentPreset.list. */
export const agentPresetEntrySchema = z.object({
  id: z.string().min(1),
  isDefault: z.boolean(),
  name: z.string().optional(),
  description: z.string().optional(),
  broken: z.string().min(1).optional(),
}) satisfies z.ZodType<Wire<AgentPresetEntry>>

/** agentPreset.list request payload. */
export const agentPresetListRequestSchema = z.object({
}) satisfies z.ZodType<Wire<RequestPayload<'agentPreset.list'>>>

/** agentPreset.list response value. */
export const agentPresetListValueSchema = z.object({
  presets: z.array(agentPresetEntrySchema),
}) satisfies z.ZodType<Wire<ResponseValue<'agentPreset.list'>>>

/** agentPreset.select request payload. */
export const agentPresetSelectRequestSchema = z.object({
  sessionId: sessionIdSchema,
  agentPreset: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'agentPreset.select'>>>

/** agentPreset.select response value. */
export const agentPresetSelectValueSchema = z.object({
  agentPreset: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'agentPreset.select'>>>
