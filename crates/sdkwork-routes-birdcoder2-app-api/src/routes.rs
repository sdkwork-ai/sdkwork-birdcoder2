//! Router construction for the mobile App API surface.
//!
//! Two mounts exist on purpose:
//!
//! - [`business_routes`] / [`gateway_mount_business`] carry the state a
//!   composing host supplies, and are what the API assembly merges.
//! - [`gateway_mount`] is the canonical no-argument mount the assembly
//!   materializer discovers, backed by a service with its own in-memory store.
//!
//! Neither mount applies the web-framework layer, so neither can serve tenant
//! data on its own: the composing gateway installs the layer that authenticates
//! the caller and injects the verified [`WebRequestContext`] the handlers
//! require. Handlers fail closed without it.
//!
//! [`WebRequestContext`]: sdkwork_web_core::WebRequestContext

use std::sync::Arc;

use axum::routing::{get, post};
use axum::Router;

use sdkwork_birdcoder2_host_runtime_service::HostRuntimeService;

use crate::handlers::{self, AppState};
use crate::paths;

/// The business routes of this surface, before state is applied.
#[must_use]
pub fn business_routes() -> Router<AppState> {
    Router::new()
        .route(paths::HOSTS_PATH, get(handlers::list_hosts))
        .route(
            paths::HOST_ENROLLMENTS_PATH,
            post(handlers::create_host_enrollment),
        )
        .route(
            paths::HOST_PATH,
            get(handlers::retrieve_host)
                .patch(handlers::update_host)
                .delete(handlers::delete_host),
        )
        .route(
            paths::HOST_AGENT_SESSIONS_PATH,
            get(handlers::list_agent_sessions).post(handlers::create_agent_session),
        )
        .route(
            paths::AGENT_SESSION_PATH,
            get(handlers::retrieve_agent_session)
                .patch(handlers::update_agent_session)
                .delete(handlers::delete_agent_session),
        )
        .route(
            paths::AGENT_SESSION_TURNS_PATH,
            get(handlers::list_agent_turns).post(handlers::create_agent_turn),
        )
        .route(
            paths::AGENT_TURN_CANCEL_PATH,
            post(handlers::cancel_agent_turn),
        )
        .route(
            paths::AGENT_SESSION_EVENTS_PATH,
            get(handlers::list_agent_events),
        )
}

/// Mounts this surface against a caller-supplied service instance.
#[must_use]
pub fn gateway_mount_business(service: Arc<HostRuntimeService>) -> Router {
    business_routes().with_state(AppState::new(service))
}

/// The canonical mount, backed by a surface-local in-memory service.
#[must_use]
pub fn gateway_mount() -> Router {
    business_routes().with_state(AppState::with_default_service())
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
