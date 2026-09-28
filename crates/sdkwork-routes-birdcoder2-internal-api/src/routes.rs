//! Router construction for the host-runtime Internal API surface.
//!
//! Two mounts exist on purpose:
//!
//! - [`business_routes`] / [`gateway_mount_business`] carry the state a
//!   composing host supplies, and are what the API assembly merges. Both
//!   surfaces of this application are merged against **one** service instance,
//!   so a host that attaches here becomes visible to the owner on the mobile
//!   surface immediately.
//! - [`gateway_mount`] is the canonical no-argument mount the assembly
//!   materializer discovers, backed by a service with its own in-memory store.
//!
//! Neither mount applies the web-framework layer, so neither can serve a host
//! runtime on its own: the composing gateway installs the layer that classifies
//! the surface, verifies the ingress token, and injects the request context the
//! handlers require. A mount without that layer rejects every call before a
//! handler body runs.

use std::sync::Arc;

use axum::routing::post;
use axum::Router;

use sdkwork_birdcoder2_host_runtime_service::HostRuntimeService;

use crate::handlers::{self, InternalState};
use crate::paths;

/// The business routes of this surface, before state is applied.
#[must_use]
pub fn business_routes() -> Router<InternalState> {
    Router::new()
        .route(
            paths::HOST_RUNTIME_HELLO_PATH,
            post(handlers::hello_host_runtime),
        )
        .route(
            paths::HOST_RUNTIME_HEARTBEAT_PATH,
            post(handlers::heartbeat_host_runtime),
        )
        .route(
            paths::HOST_RUNTIME_CLOSE_PATH,
            post(handlers::close_host_runtime),
        )
        .route(
            paths::HOST_RUNTIME_TURN_CLAIMS_PATH,
            post(handlers::claim_pending_turns),
        )
        .route(
            paths::HOST_RUNTIME_AGENT_EVENTS_PATH,
            post(handlers::report_agent_events),
        )
}

/// Mounts this surface against a caller-supplied service instance.
#[must_use]
pub fn gateway_mount_business(service: Arc<HostRuntimeService>) -> Router {
    business_routes().with_state(InternalState::new(service))
}

/// The canonical mount, backed by a surface-local in-memory service.
#[must_use]
pub fn gateway_mount() -> Router {
    business_routes().with_state(InternalState::with_default_service())
}

/// Builds the mount with an explicit service, failing when the router cannot be
/// constructed.
///
/// # Errors
///
/// Reserved for router-construction failures; the current implementation always
/// succeeds, so a composing host can treat the failure as a configuration
/// defect rather than a runtime condition.
pub fn build_router_with_service(service: Arc<HostRuntimeService>) -> Result<Router, String> {
    Ok(gateway_mount_business(service))
}
