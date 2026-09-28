//! Route manifest of the BirdCoder2 host-runtime Internal API surface.
//!
//! Every operation is `ingress-token` gated: the caller is a host runtime
//! process, and the lease it presents in the body is a second, per-host factor
//! the handlers verify against the registry.
//!
//! Operation ids follow `API_SPEC.md` section 15.4: the trailing segment matches
//! the inferred operation pattern, so `hello`, `heartbeat`, and `close` are
//! commands (rendered `200`), while `turn-claims` and `agent-events` are creates
//! (rendered `201`). No identifier ever appears in a path — the lease in the body
//! is the authority, and an identifier in a path would land in access logs.

use sdkwork_web_contract::{HttpMethod, HttpRoute};
use sdkwork_web_core::HttpRouteManifest;

use crate::paths;

/// Permission code a host runtime must hold to attach and relay.
pub const HOST_RUNTIME_PERMISSION: &str = "birdcoder.host-runtime.connect";

/// The served route set of this surface.
pub const INTERNAL_API_ROUTES: &[HttpRoute] = &[
    HttpRoute::ingress_token(
        HttpMethod::Post,
        paths::HOST_RUNTIME_HELLO_PATH,
        "host-runtimes",
        "hostRuntimes.hello",
    )
    .with_required_permission(HOST_RUNTIME_PERMISSION),
    HttpRoute::ingress_token(
        HttpMethod::Post,
        paths::HOST_RUNTIME_HEARTBEAT_PATH,
        "host-runtimes",
        "hostRuntimes.heartbeat",
    )
    .with_required_permission(HOST_RUNTIME_PERMISSION),
    HttpRoute::ingress_token(
        HttpMethod::Post,
        paths::HOST_RUNTIME_CLOSE_PATH,
        "host-runtimes",
        "hostRuntimes.close",
    )
    .with_required_permission(HOST_RUNTIME_PERMISSION),
    HttpRoute::ingress_token(
        HttpMethod::Post,
        paths::HOST_RUNTIME_TURN_CLAIMS_PATH,
        "host-runtimes",
        "turnClaims.create",
    )
    .with_required_permission(HOST_RUNTIME_PERMISSION),
    HttpRoute::ingress_token(
        HttpMethod::Post,
        paths::HOST_RUNTIME_AGENT_EVENTS_PATH,
        "host-runtimes",
        "agentEvents.create",
    )
    .with_required_permission(HOST_RUNTIME_PERMISSION),
];

/// The route manifest this surface publishes to the composing assembly.
#[must_use]
pub fn internal_api_route_manifest() -> HttpRouteManifest {
    HttpRouteManifest::new(INTERNAL_API_ROUTES)
}
