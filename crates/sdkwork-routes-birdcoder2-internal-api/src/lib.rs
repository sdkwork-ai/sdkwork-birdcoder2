#![forbid(unsafe_code)]
//! BirdCoder2 host-runtime **Internal API** surface: attach, lease, turn claim,
//! and agent event intake.
//!
//! # Why this surface exists
//!
//! The other half of `sdkwork-routes-birdcoder2-app-api`: the mobile client
//! cannot run the agent runtime, so the runtime lives on a *host* and connects
//! **outward** to the platform. This surface is where that outbound connection
//! lands:
//!
//! 1. the owner issues a pairing code on the mobile surface
//!    (`hostEnrollments.create`);
//! 2. the host runtime redeems it here (`hostRuntimes.hello`) and takes a lease;
//! 3. it keeps the lease alive with `hostRuntimes.heartbeat`, and releases it on
//!    a clean shutdown with `hostRuntimes.close`;
//! 4. it polls `turnClaims.create` for turns the mobile client enqueued, and
//!    pushes what the agent produced back through `agentEvents.create`, which
//!    assigns each event its sequence in the conversation and fans it out.
//!
//! # Authentication
//!
//! Two factors, in this order: the composing gateway verifies the ingress token
//! (`HttpRoute::ingress_token` in [`crate::manifest`]) and the handlers then
//! verify the lease against the registry. The lease deliberately travels in the
//! request **body** — never in a path or a query string — so that neither a
//! proxy access log nor a browser history can carry it.
//!
//! # Boundaries
//!
//! A wire adapter only. Lifecycle rules, lease expiry, scope filtering, and the
//! event log live in [`sdkwork_birdcoder2_host_runtime_service`]; the response
//! envelope and Problem mapping live in [`crate::response`] and
//! [`crate::errors`]. The crate applies no authentication layer of its own.

mod errors;
mod handlers;
pub mod manifest;
mod paths;
mod payloads;
mod response;
mod routes;

pub use errors::to_framework_error;
pub use handlers::{
    claim_pending_turns, close_host_runtime, heartbeat_host_runtime, hello_host_runtime,
    report_agent_events, InternalState,
};
pub use manifest::{internal_api_route_manifest, HOST_RUNTIME_PERMISSION, INTERNAL_API_ROUTES};
pub use payloads::{
    AgentEventReportItem, AgentEventReportRequest, AgentEventReportView, AgentEventView,
    HostLeaseRequest, HostLeaseView, HostRuntimeCloseView, HostRuntimeHelloRequest,
    HostRuntimeHelloView, HostRuntimeView, TurnClaimRequest, TurnClaimView,
};
pub use response::{created_api_json, finish_api_json, item_data, problem_from, ApiResult};
pub use routes::{build_router_with_service, business_routes, gateway_mount, gateway_mount_business};

/// The route manifest this surface publishes to the composing assembly.
#[must_use]
pub fn gateway_route_manifest() -> sdkwork_web_core::HttpRouteManifest {
    manifest::internal_api_route_manifest()
}

/// The number of routes this surface contributes, for assembly assertions.
#[must_use]
pub fn route_count() -> usize {
    INTERNAL_API_ROUTES.len()
}
