//! Route manifest of the BirdCoder2 mobile App API surface.
//!
//! Authority for the served route set: [`crate::paths`] owns the paths, this
//! module owns the operation ids, the auth shape, and the permission hints, and
//! the assembly publishes the merged manifest to the composing gateway.
//!
//! Every operation is `dual-token` gated: the caller is an end user of the
//! mobile client, and the handlers additionally fail closed when the verified
//! principal is absent.

use sdkwork_web_contract::{HttpMethod, HttpRoute};
use sdkwork_web_core::HttpRouteManifest;

use crate::paths;

/// Permission code required to read the caller's hosts.
pub const HOSTS_READ_PERMISSION: &str = "birdcoder.hosts.read";
/// Permission code required to mutate the caller's hosts.
pub const HOSTS_WRITE_PERMISSION: &str = "birdcoder.hosts.write";
/// Permission code required to read and drive agent conversations.
pub const AGENT_PERMISSION: &str = "birdcoder.agent.invoke";

/// The served route set of this surface.
pub const APP_API_ROUTES: &[HttpRoute] = &[
    HttpRoute::dual_token(HttpMethod::Get, paths::HOSTS_PATH, "hosts", "hosts.list")
        .with_required_permission(HOSTS_READ_PERMISSION),
    HttpRoute::dual_token(
        HttpMethod::Post,
        paths::HOST_ENROLLMENTS_PATH,
        "hosts",
        "hostEnrollments.create",
    )
    .with_required_permission(HOSTS_WRITE_PERMISSION),
    HttpRoute::dual_token(HttpMethod::Get, paths::HOST_PATH, "hosts", "hosts.retrieve")
        .with_required_permission(HOSTS_READ_PERMISSION),
    HttpRoute::dual_token(HttpMethod::Patch, paths::HOST_PATH, "hosts", "hosts.update")
        .with_required_permission(HOSTS_WRITE_PERMISSION),
    HttpRoute::dual_token(HttpMethod::Delete, paths::HOST_PATH, "hosts", "hosts.delete")
        .with_required_permission(HOSTS_WRITE_PERMISSION),
    HttpRoute::dual_token(
        HttpMethod::Get,
        paths::HOST_AGENT_SESSIONS_PATH,
        "agent",
        "agentSessions.list",
    )
    .with_required_permission(AGENT_PERMISSION),
    HttpRoute::dual_token(
        HttpMethod::Post,
        paths::HOST_AGENT_SESSIONS_PATH,
        "agent",
        "agentSessions.create",
    )
    .with_required_permission(AGENT_PERMISSION),
    HttpRoute::dual_token(
        HttpMethod::Get,
        paths::AGENT_SESSION_PATH,
        "agent",
        "agentSessions.retrieve",
    )
    .with_required_permission(AGENT_PERMISSION),
    HttpRoute::dual_token(
        HttpMethod::Patch,
        paths::AGENT_SESSION_PATH,
        "agent",
        "agentSessions.update",
    )
    .with_required_permission(AGENT_PERMISSION),
    HttpRoute::dual_token(
        HttpMethod::Delete,
        paths::AGENT_SESSION_PATH,
        "agent",
        "agentSessions.delete",
    )
    .with_required_permission(AGENT_PERMISSION),
    HttpRoute::dual_token(
        HttpMethod::Get,
        paths::AGENT_SESSION_TURNS_PATH,
        "agent",
        "agentTurns.list",
    )
    .with_required_permission(AGENT_PERMISSION),
    HttpRoute::dual_token(
        HttpMethod::Post,
        paths::AGENT_SESSION_TURNS_PATH,
        "agent",
        "agentTurns.create",
    )
    .with_required_permission(AGENT_PERMISSION),
    HttpRoute::dual_token(
        HttpMethod::Post,
        paths::AGENT_TURN_CANCEL_PATH,
        "agent",
        "agentTurns.cancel",
    )
    .with_required_permission(AGENT_PERMISSION),
    HttpRoute::dual_token(
        HttpMethod::Get,
        paths::AGENT_SESSION_EVENTS_PATH,
        "agent",
        "agentEvents.list",
    )
    .with_required_permission(AGENT_PERMISSION),
];

/// The route manifest this surface publishes to the composing assembly.
#[must_use]
pub fn app_api_route_manifest() -> HttpRouteManifest {
    HttpRouteManifest::new(APP_API_ROUTES)
}
