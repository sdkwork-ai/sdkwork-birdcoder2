//! Router construction for the installation App API surface.
//!
//! Two mounts exist on purpose:
//!
//! - [`business_routes`] / [`gateway_mount_business`] carry the service a
//!   composing host supplies, and are what the API assembly merges.
//! - [`gateway_mount`] is the canonical no-argument mount the assembly
//!   materializer discovers, backed by the shipped product identity.
//!
//! Neither mount applies the web-framework layer, so neither can serve a
//! verified installation on its own: the composing gateway installs the layer
//! that authenticates the caller and injects the [`WebRequestContext`] the
//! handler requires. The handler fails closed without it.
//!
//! [`WebRequestContext`]: sdkwork_web_core::WebRequestContext

use std::sync::Arc;

use axum::routing::get;
use axum::Router;

use sdkwork_birdcoder2_installation_service::InstallationApplicationService;

use crate::handlers::{self, InstallationState};
use crate::paths;

/// The business routes of this surface, before state is applied.
/// @returns the unstated router.
pub fn business_routes() -> Router<InstallationState> {
    Router::new().route(
        paths::INSTALLATION_PATH,
        get(handlers::retrieve_installation),
    )
}

/// Mounts this surface against a caller-supplied service instance.
/// @param service - shared installation application service.
/// @returns the stated router.
pub fn gateway_mount_business(service: Arc<InstallationApplicationService>) -> Router {
    business_routes().with_state(InstallationState::new(service))
}

/// The canonical mount, backed by the shipped product identity.
/// @returns the stated router.
pub fn gateway_mount() -> Router {
    business_routes().with_state(InstallationState::with_default_service())
}

/// The route manifest this surface publishes to the composing assembly.
/// @returns the merged manifest the gateway authorizes against.
#[must_use]
pub fn gateway_route_manifest() -> sdkwork_web_core::HttpRouteManifest {
    crate::manifest::installation_api_route_manifest()
}

/// Builds the mount with an explicit service.
/// @param service - shared installation application service.
/// @returns the stated router.
///
/// # Errors
///
/// Reserved for router-construction failures; the current implementation always
/// succeeds, so a composing host can treat a failure as a configuration defect
/// rather than a runtime condition.
pub fn build_router_with_service(
    service: Arc<InstallationApplicationService>,
) -> Result<Router, String> {
    Ok(gateway_mount_business(service))
}
