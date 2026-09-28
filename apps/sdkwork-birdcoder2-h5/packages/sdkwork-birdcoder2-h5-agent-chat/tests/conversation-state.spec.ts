import { describe, expect, it } from 'vitest'

import { BirdCoder2ApiError, type AgentEvent } from '@sdkwork/birdcoder2-h5-core'

import {
  BIRDCODER2_H5_AGENT_CHAT_PACKAGE,
  BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS,
} from '../src/routes/appRouteContributions'
import {
  resolveAgentChatLanguage,
  resolveAgentChatMessages,
  type AgentChatLanguage,
} from '../src/messages/agentChatMessages'
import { readDeltaText, toConversationFailure } from '../src/state/conversationState'

function delta(payload: unknown): AgentEvent {
  return {
    eventId: 'e-1',
    sessionId: 's-1',
    turnId: 't-1',
    sequence: '7',
    kind: 'assistant-delta',
    payload,
    emittedAt: '2026-09-28T00:00:00.000Z',
  }
}

describe('readDeltaText', () => {
  it('reads the incremental text out of a `text` payload', () => {
    expect(readDeltaText(delta({ text: 'hello' }))).toBe('hello')
  })

  it('accepts the `delta` spelling as well', () => {
    expect(readDeltaText(delta({ delta: 'hello' }))).toBe('hello')
  })

  it('prefers `text` when a payload carries both', () => {
    expect(readDeltaText(delta({ text: 'a', delta: 'b' }))).toBe('a')
  })

  it('degrades to no text instead of throwing on an unexpected payload', () => {
    // The event log is host-owned, so a payload change must not crash the render.
    expect(readDeltaText(delta(null))).toBe('')
    expect(readDeltaText(delta('hello'))).toBe('')
    expect(readDeltaText(delta(42))).toBe('')
    expect(readDeltaText(delta(undefined))).toBe('')
    expect(readDeltaText(delta({}))).toBe('')
    expect(readDeltaText(delta({ text: 42 }))).toBe('')
    expect(readDeltaText(delta({ text: null }))).toBe('')
  })

  it('keeps an empty-string delta distinguishable from no delta', () => {
    expect(readDeltaText(delta({ text: '' }))).toBe('')
  })
})

describe('toConversationFailure', () => {
  it('collapses the platform status into what the user can act on', () => {
    expect(toConversationFailure(new BirdCoder2ApiError('nope', { status: 401 })).code).toBe('authentication')
    expect(toConversationFailure(new BirdCoder2ApiError('nope', { status: 403 })).code).toBe('authentication')
  })

  it('keeps a lapsed host lease actionable rather than retryable', () => {
    const failure = toConversationFailure(new BirdCoder2ApiError('lease gone', { status: 409, code: 40902 }))
    expect(failure.code).toBe('unknown')
    expect(failure.message).toBe('lease gone')
  })

  it('carries the trace id when the platform sent one', () => {
    const failure = toConversationFailure(new BirdCoder2ApiError('boom', { status: 500, traceId: 'tr-1' }))
    expect(failure).toEqual({ code: 'unknown', message: 'boom (trace tr-1)' })
  })

  it('normalizes a plain error and a thrown non-error', () => {
    expect(toConversationFailure(new Error('offline'))).toEqual({ code: 'unknown', message: 'offline' })
    expect(toConversationFailure('offline')).toEqual({ code: 'unknown', message: 'offline' })
  })
})

describe('conversation catalog', () => {
  it('carries the same keys in every language', () => {
    const languages: readonly AgentChatLanguage[] = ['en', 'zh-Hans', 'zh-Hant']
    const keySets = languages.map(language => Object.keys(resolveAgentChatMessages(language)).sort())
    expect(keySets[1]).toEqual(keySets[0])
    expect(keySets[2]).toEqual(keySets[0])
  })

  it('never leaves a message empty', () => {
    for (const language of ['en', 'zh-Hans', 'zh-Hant'] as const) {
      for (const [key, value] of Object.entries(resolveAgentChatMessages(language))) {
        expect(value.trim(), `${language}.${key}`).not.toBe('')
      }
    }
  })

  it('shares the language resolution rule with the other capability', () => {
    expect(resolveAgentChatLanguage('zh-HK')).toBe('zh-Hant')
    expect(resolveAgentChatLanguage('zh-CN')).toBe('zh-Hans')
    expect(resolveAgentChatLanguage('en-GB')).toBe('en')
  })
})

describe('conversation route contributions', () => {
  it('puts the live conversation on the root tab', () => {
    expect(BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS[0]?.id).toBe('app.agent.chat.index')
    expect(BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS[0]?.path).toBe('/')
    expect(BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS[0]?.presentation).toBe('tab')
  })

  it('lists the sessions on a second tab', () => {
    expect(BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS[1]?.id).toBe('app.agent.chat.sessions')
    expect(BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS[1]?.path).toBe('/sessions')
    expect(BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS[1]?.presentation).toBe('tab')
  })

  it('labels both tabs, since the shell renders a tab through its label key', () => {
    for (const route of BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS) {
      expect(route.tabLabelKey, route.id).toBeDefined()
    }
    expect(BIRDCODER2_H5_AGENT_CHAT_PACKAGE).toBe('@sdkwork/birdcoder2-h5-agent-chat')
  })
})
