#![forbid(unsafe_code)]
//! BirdCoder2 mobile **App API** surface: multi-host registry and the relayed
//! agent conversation.
//!
//! # Why this surface exists
//!
//! The BirdCoder2 mobile client cannot run the agent runtime: an H5 page and a
//! Capacitor shell have no process to host it. The runtime therefore lives on a
//! *host* — a Windows, Linux, or macOS machine running the signed desktop/CLI
//! instance, a Docker container, or a cloud `sdkwork-sandbox` instance — and the
//! platform relays the conversation:
//!
//! 1. the mobile client registers a host by issuing a pairing code
//!    (`hostEnrollments.create`);
//! 2. the host runtime redeems that code on
//!    `sdkwork-routes-birdcoder2-internal-api` and takes a lease;
//! 3. the mobile client opens a conversation on the host
//!    (`agentSessions.create`) and appends turns (`agentTurns.create`);
//! 4. the host claims pending turns and pushes agent events back, and the mobile
//!    client reads them from the ordered event log (`agentEvents.list`) using its
//!    own `sequence` watermark.
//!
//! # Boundaries
//!
//! This crate is a wire adapter only. Lifecycle rules, scope filtering, and the
//! event log live in [`sdkwork_birdcoder2_host_runtime_service`]; the response
//! envelope and Problem mapping live in [`crate::response`] and
//! [`crate::errors`]. The crate applies no authentication layer of its own — the
//! composing gateway installs the web-framework layer that resolves the verified
//! request context every handler requires.

mod errors;
mod handlers;
pub mod manifest;
mod paths;
mod payloads;
mod response;
mod routes;

pub use errors::to_framework_error;
pub use handlers::{
    cancel_agent_turn, create_agent_session, create_agent_turn, create_host_enrollment,
    delete_agent_session, delete_host, list_agent_events, list_agent_sessions, list_agent_turns,
    list_hosts, retrieve_agent_session, retrieve_host, update_agent_session, update_host,
    AgentSessionPath, AgentTurnPath, AppState, HostIdPath,
};
pub use manifest::{
    app_api_route_manifest, AGENT_PERMISSION, APP_API_ROUTES, HOSTS_READ_PERMISSION,
    HOSTS_WRITE_PERMISSION,
};
pub use payloads::{
    AgentEventListQuery, AgentEventView, AgentSessionCreateRequest, AgentSessionListQuery,
    AgentSessionUpdateRequest, AgentSessionView, AgentTurnCreateRequest, AgentTurnListQuery,
    AgentTurnView, HostEnrollmentCreateRequest, HostEnrollmentView, HostLeaseView, HostListQuery,
    HostUpdateRequest, HostView,
};
pub use response::{
    created_api_json, cursor_page_data, deleted_api_response, finish_api_json, item_data,
    problem_from, ApiResult,
};
pub use routes::{build_router_with_service, business_routes, gateway_mount, gateway_mount_business};

/// The route manifest this surface publishes to the composing assembly.
#[must_use]
pub fn gateway_route_manifest() -> sdkwork_web_core::HttpRouteManifest {
    manifest::app_api_route_manifest()
}

/// The number of routes this surface contributes, for assembly assertions.
#[must_use]
pub fn route_count() -> usize {
    APP_API_ROUTES.len()
}
