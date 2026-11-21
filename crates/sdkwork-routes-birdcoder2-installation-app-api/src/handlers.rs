//! HTTP handlers of the installation App API surface.
//!
//! The handler takes the verified [`WebRequestContext`] as an extractor and reads
//! the installation from it, never from a header, query parameter, or body: the
//! gateway injects the context after authentication, and a mount without that
//! layer rejects the request before reaching this body.

use std::sync::Arc;

use axum::extract::State;
use axum::response::Response;

use sdkwork_birdcoder2_installation_service::InstallationApplicationService;
use sdkwork_web_core::{WebFrameworkError, WebRequestContext};

use crate::identity::installation_identity;
use crate::payloads::InstallationApplicationView;
use crate::response::{finish_api_json, item_data, problem_from};

/// State shared by every handler of this surface.
#[derive(Clone)]
pub struct InstallationState {
    /// The installation application service publishing the product slice.
    pub service: Arc<InstallationApplicationService>,
}

impl InstallationState {
    /// Binds the surface to one service instance.
    /// @param service - shared installation application service.
    /// @returns the handler state.
    #[must_use]
    pub fn new(service: Arc<InstallationApplicationService>) -> Self {
        Self { service }
    }

    /// Binds the surface to the shipped product identity.
    ///
    /// Used by the assembly's default constructor and by tests; a deployment
    /// that publishes another display identity passes its service in through
    /// [`InstallationState::new`].
    /// @returns the handler state with this repository's product profile.
    #[must_use]
    pub fn with_default_service() -> Self {
        Self {
            service: Arc::new(InstallationApplicationService::shipped()),
        }
    }
}

/// `GET /app/v3/api/installation`
pub async fn retrieve_installation(
    ctx: WebRequestContext,
    State(state): State<InstallationState>,
) -> Response {
    let Some(principal) = ctx.principal() else {
        return problem_from(
            &ctx,
            WebFrameworkError::missing_credentials("an authenticated principal is required"),
        );
    };
    let result = installation_identity(principal).map(|identity| {
        item_data(InstallationApplicationView::from(
            &state.service.resolve(&identity),
        ))
    });
    finish_api_json(&ctx, result)
}
