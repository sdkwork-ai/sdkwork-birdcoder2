/** Reachability of a host. pending: registered, no runtime attached. online: a runtime holds a live lease. offline: the lease lapsed or was closed. disabled: an operator disabled it. */
export type HostStatus = 'pending' | 'online' | 'offline' | 'disabled';
