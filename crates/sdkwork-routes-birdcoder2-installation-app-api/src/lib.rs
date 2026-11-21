#![forbid(unsafe_code)]
//! BirdCoder2 **installation application** App API surface.
//!
//! # Why this surface exists
//!
//! The About surface answers three questions a client cannot answer from its
//! own build: which installation does the presented access token belong to,
//! what release scope was that credential issued for, and which lifecycle
//! environment and deployment topology is this runtime. The client knows the
//! answer only after the platform verifies the token, so the answer is a read of
//! the verified request identity — never a client-supplied `appId`.
//!
//! # Boundaries
//!
//! This crate is a wire adapter: it resolves the verified principal into an
//! installation identity and projects the
//! [`sdkwork_birdcoder2_installation_service`] domain payload onto the platform
//! envelope. Paths, the operation id, and the auth shape live here in
//! [`manifest`]; lifecycle rules and the product slice live in the service
//! crate. The crate applies no authentication layer of its own — the composing
//! gateway installs the layer that verifies the caller and injects the
//! [`WebRequestContext`] the handler requires, and the handler fails closed
//! without it.
//!
//! [`WebRequestContext`]: sdkwork_web_core::WebRequestContext

mod errors;
mod handlers;
mod identity;
pub mod manifest;
mod paths;
mod payloads;
mod response;
mod routes;

pub use errors::to_framework_error;
pub use handlers::{retrieve_installation, InstallationState};
pub use manifest::{installation_api_route_manifest, INSTALLATION_API_ROUTES};
pub use paths::INSTALLATION_PATH;
pub use payloads::{InstallationApplicationView, InstallationProductView};
pub use response::{finish_api_json, item_data, problem_from, ApiResult};
pub use routes::{
    build_router_with_service, business_routes, gateway_mount, gateway_mount_business,
    gateway_route_manifest,
};

/// The number of routes this surface contributes, for assembly assertions.
/// @returns the served route count.
#[must_use]
pub fn route_count() -> usize {
    manifest::INSTALLATION_API_ROUTES.len()
}

/// The route manifest this surface publishes to the composing assembly.
#[must_use]
pub fn installation_route_manifest() -> sdkwork_web_core::HttpRouteManifest {
    manifest::installation_api_route_manifest()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_surface_serves_one_read_route() {
        assert_eq!(route_count(), 1);
        assert_eq!(
            installation_route_manifest().routes()[0].operation_id,
            "installation.retrieve"
        );
    }
}
