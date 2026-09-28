/** Delivery state of a turn. pending: enqueued, not yet claimed. running: claimed by the host. completed, failed, cancelled: terminal. */
export type AgentTurnStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
