//! Wire paths of the BirdCoder2 host-runtime Internal API surface.
//!
//! The host runtime is a machine client, not an end user: it authenticates with
//! an ingress token and then with the lease it received when it redeemed its
//! pairing code. Every path lives under `/internal/v3/api/birdcoder` and names
//! the resource family, so no identifier ever appears in the path — the lease in
//! the body is the authority.
//!
//! Static segments are `lower_snake_case` (`API_SPEC.md` section 5.1).

/// `POST` — redeem a pairing code and attach this runtime.
pub const HOST_RUNTIME_HELLO_PATH: &str = "/internal/v3/api/birdcoder/host_runtimes/hello";

/// `POST` — extend the lease.
pub const HOST_RUNTIME_HEARTBEAT_PATH: &str = "/internal/v3/api/birdcoder/host_runtimes/heartbeat";

/// `POST` — close the lease on a clean shutdown.
pub const HOST_RUNTIME_CLOSE_PATH: &str = "/internal/v3/api/birdcoder/host_runtimes/close";

/// `POST` — claim pending turns the mobile client enqueued for this host.
pub const HOST_RUNTIME_TURN_CLAIMS_PATH: &str =
    "/internal/v3/api/birdcoder/host_runtimes/turn_claims";

/// `POST` — report agent events for fan-out to the mobile client.
pub const HOST_RUNTIME_AGENT_EVENTS_PATH: &str =
    "/internal/v3/api/birdcoder/host_runtimes/agent_events";
