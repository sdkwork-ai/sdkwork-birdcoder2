//! Wire paths of the BirdCoder2 mobile App API surface.
//!
//! Authority: the mobile client addresses hosts and conversations under
//! `/app/v3/api/birdcoder`. Physical paths are this surface's own; the route
//! *identities* other client roots must match are declared in
//! `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` section 7 and lived in the H5
//! root's core route registry.
//!
//! Static segments are `lower_snake_case` and path parameters are
//! `lowerCamelCase` (`API_SPEC.md` section 5.1). The SDKWork v3 SDK standard
//! enforces the same rule when it consumes the OpenAPI authority, so a
//! kebab-case segment here would fail SDK generation rather than ship.

/// `GET` — list the caller's hosts.
pub const HOSTS_PATH: &str = "/app/v3/api/birdcoder/hosts";

/// `POST` — issue a pairing code for a new host.
pub const HOST_ENROLLMENTS_PATH: &str = "/app/v3/api/birdcoder/host_enrollments";

/// `GET`, `PATCH`, `DELETE` — one host.
pub const HOST_PATH: &str = "/app/v3/api/birdcoder/hosts/{hostId}";

/// `GET`, `POST` — the agent conversations running on one host.
pub const HOST_AGENT_SESSIONS_PATH: &str = "/app/v3/api/birdcoder/hosts/{hostId}/agent_sessions";

/// `GET`, `PATCH`, `DELETE` — one agent conversation.
pub const AGENT_SESSION_PATH: &str = "/app/v3/api/birdcoder/agent_sessions/{sessionId}";

/// `GET`, `POST` — the transcript of one conversation.
pub const AGENT_SESSION_TURNS_PATH: &str =
    "/app/v3/api/birdcoder/agent_sessions/{sessionId}/turns";

/// `POST` — cancel one in-flight turn.
pub const AGENT_TURN_CANCEL_PATH: &str =
    "/app/v3/api/birdcoder/agent_sessions/{sessionId}/turns/{turnId}/cancel";

/// `GET` — ordered agent events after a sequence watermark.
pub const AGENT_SESSION_EVENTS_PATH: &str =
    "/app/v3/api/birdcoder/agent_sessions/{sessionId}/events";
