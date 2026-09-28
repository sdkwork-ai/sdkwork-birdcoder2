/** Kind of one agent event in a conversation log. */
export type AgentEventKind = 'turn-started' | 'assistant-delta' | 'assistant-completed' | 'tool-started' | 'tool-completed' | 'turn-failed' | 'turn-cancelled' | 'host-status-changed';
