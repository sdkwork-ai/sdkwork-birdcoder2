//! Route manifest of the BirdCoder2 installation App API surface.
//!
//! Authority for the served route set: [`crate::paths`] owns the path, this
//! module owns the operation id and the auth shape, and the assembly publishes
//! the merged manifest to the composing gateway.
//!
//! The operation is `dual-token` gated like every other App API call: the
//! caller is an end user presenting either a signed pair or the deployment's
//! public application access token. It declares no extra permission: the
//! response describes the caller's own credential, so a caller that can reach
//! the surface at all is entitled to it, and the handler fails closed when the
//! verified context names no installation.

use sdkwork_web_contract::{HttpMethod, HttpRoute};
use sdkwork_web_core::HttpRouteManifest;

use crate::paths;

/// The served route set of this surface.
pub const INSTALLATION_API_ROUTES: &[HttpRoute] = &[HttpRoute::dual_token(
    HttpMethod::Get,
    paths::INSTALLATION_PATH,
    "installation",
    "installation.retrieve",
)];

/// The route manifest this surface publishes to the composing assembly.
#[must_use]
pub fn installation_api_route_manifest() -> HttpRouteManifest {
    HttpRouteManifest::new(INSTALLATION_API_ROUTES)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_carries_the_installation_read_operation() {
        let manifest = installation_api_route_manifest();
        let routes = manifest.routes();
        assert_eq!(routes.len(), INSTALLATION_API_ROUTES.len());
        let route = &routes[0];
        assert_eq!(route.method, HttpMethod::Get);
        assert_eq!(route.path, "/app/v3/api/installation");
        assert_eq!(route.operation_id, "installation.retrieve");
        assert_eq!(route.tag, "installation");
        assert_eq!(route.required_permission, None);
    }
}
