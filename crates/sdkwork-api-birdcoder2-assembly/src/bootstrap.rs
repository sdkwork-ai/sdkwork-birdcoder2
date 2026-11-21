//! API assembly bootstrap for sdkwork-birdcoder2.
//!
//! The assembly exports the indivisible [`ApiAssemblyContribution`] contract
//! (`API_ASSEMBLY_SPEC.md` section 4): one router, one merged route manifest, the
//! domain context injectors, and the readiness check — never a bare `Router`.
//!
//! # The application's surfaces
//!
//! - `sdkwork-routes-birdcoder2-app-api` is the **mobile** end: the owner's H5
//!   client registers hosts and drives agent conversations;
//! - `sdkwork-routes-birdcoder2-internal-api` is the **host** end: the runtime
//!   running on Windows/Linux/macOS, in Docker, or in a cloud `sdkwork-sandbox`
//!   attaches, takes a lease, claims turns, and pushes agent events back;
//! - `sdkwork-routes-birdcoder2-installation-app-api` is the **identity** end: it
//!   reports which installation the caller's access token names, so every
//!   client surface (About included) can render the deployment identity the
//!   platform verified instead of a locally guessed one.
//!
//! The two relay surfaces are mounted against **one** [`HostRuntimeService`]
//! instance. That sharing is load-bearing: a host that redeems a pairing code on
//! the internal surface must appear in the owner's registry on the mobile
//! surface in the same process, and a lease minted for a host must resolve the
//! turns the owner enqueued. Two instances would break every relay step. The
//! installation surface reads no store at all; it projects the verified request
//! identity onto the product profile the composing host supplies.
//!
//! # Composition
//!
//! The bootstrap applies no web-framework layer. The composing gateway installs
//! it, which is what classifies each call as `app-api` or `internal-api`,
//! authenticates it (dual token versus ingress token), and injects the verified
//! request context every surface's handlers require. A mount used without that
//! layer therefore rejects every request instead of serving tenant data.
//!
//! Storage: the relay service's in-memory store is the standalone/test adapter.
//! A SQLx-backed repository is the next increment and slots in behind
//! [`assemble_api_router_with_service`] without touching a call site.

use std::sync::Arc;

use axum::Router;
use sdkwork_birdcoder2_host_runtime_service::HostRuntimeService;
use sdkwork_birdcoder2_installation_service::{
    InstallationApplicationService, InstallationProductProfile,
};
use sdkwork_web_bootstrap::{ApiAssemblyContribution, ReadinessCheck, WebModule};
use sdkwork_web_core::{DomainContextInjector, HttpRouteManifest};

use sdkwork_routes_birdcoder2_app_api as birdcoder2_app_api;
use sdkwork_routes_birdcoder2_installation_app_api as birdcoder2_installation_api;
use sdkwork_routes_birdcoder2_internal_api as birdcoder2_internal_api;

/// Indivisible host-neutral API assembly contribution (web-bootstrap contract).
pub type ApiAssembly = ApiAssemblyContribution;

/// Assembly inputs the composing host supplies, rather than the assembly
/// reaching for process state of its own (`API_ASSEMBLY_SPEC.md` section 4.1.1).
pub struct ApiAssemblyContext {
    /// Extra domain context injectors, applied after the framework layer.
    pub domain_context_injectors: Vec<Arc<dyn DomainContextInjector>>,
    /// Readiness probe the gateway exposes on its health endpoint.
    pub readiness_check: Arc<dyn ReadinessCheck>,
    /// Product identity the installation surface publishes.
    ///
    /// The shipped default is the BirdCoder identity declared by
    /// `agent.app.config.json`; a deployment that ships another display
    /// identity substitutes its own complete profile here.
    pub installation_product: InstallationProductProfile,
}

impl Default for ApiAssemblyContext {
    fn default() -> Self {
        Self {
            domain_context_injectors: Vec::new(),
            readiness_check: Arc::new(sdkwork_web_bootstrap::AlwaysReady),
            installation_product: InstallationProductProfile::birdcoder(),
        }
    }
}

/// Builds the router carrying every surface against one shared relay service.
///
/// The mounts are merged as local values, not as `router.merge(sdkwork_routes_…)`
/// calls: a gateway host must never hand-merge a route crate by name (the API
/// assembly owns route ownership), so the surface adapters are the only place the
/// crate names appear.
fn birdcoder2_router(
    service: Arc<HostRuntimeService>,
    installation: Arc<InstallationApplicationService>,
) -> Router {
    let app_api = birdcoder2_app_api::gateway_mount_business(Arc::clone(&service));
    let installation_api = birdcoder2_installation_api::gateway_mount_business(installation);
    let internal_api = birdcoder2_internal_api::gateway_mount_business(service);
    Router::new()
        .merge(app_api)
        .merge(installation_api)
        .merge(internal_api)
}

/// Merges every surface's route manifest into the application's published set.
///
/// The gateway reads this to classify and authorize each call, so a surface
/// whose manifest is missing here would be served unauthenticated or not at all.
fn birdcoder2_route_manifest() -> HttpRouteManifest {
    let mut routes = birdcoder2_app_api::gateway_route_manifest()
        .routes()
        .to_vec();
    routes.extend_from_slice(birdcoder2_installation_api::gateway_route_manifest().routes());
    routes.extend_from_slice(birdcoder2_internal_api::gateway_route_manifest().routes());
    HttpRouteManifest::from_owned_routes(routes)
}

/// Assembles the contribution against a caller-supplied service instance, so a
/// composing host can share one registry with the rest of its process.
///
/// # Errors
///
/// Returns the contribution validator's message — an unknown owner prefix, an
/// auth-shape mismatch, an empty public path set, or an installation product
/// profile the supplied context left incomplete.
pub async fn assemble_api_router_with_service(
    service: Arc<HostRuntimeService>,
    context: ApiAssemblyContext,
) -> Result<ApiAssembly, String> {
    let installation = Arc::new(
        InstallationApplicationService::new(context.installation_product.clone())
            .map_err(|error| error.to_string())?,
    );
    ApiAssemblyContribution::from_manifest(
        "sdkwork-birdcoder2",
        "SDKWork BirdCoder2 API",
        birdcoder2_router(service, installation),
        birdcoder2_route_manifest(),
        context.domain_context_injectors,
        context.readiness_check,
    )
}

/// Assembles the contribution with an assembly-local service instance — the
/// canonical entry point a standalone host calls.
///
/// # Errors
///
/// Returns the contribution validator's message.
pub async fn assemble_api_router(context: ApiAssemblyContext) -> Result<ApiAssembly, String> {
    assemble_api_router_with_service(Arc::new(HostRuntimeService::new()), context).await
}

/// Installs this application as a Web Module with caller-supplied assembly
/// context (`API_ASSEMBLY_SPEC.md` section 4.1.1), on a caller-shared service.
///
/// # Errors
///
/// Returns the error propagated from [`assemble_api_router_with_service`].
pub async fn web_module_with_service(
    service: Arc<HostRuntimeService>,
    context: ApiAssemblyContext,
) -> Result<WebModule, String> {
    Ok(WebModule::from_contribution(
        assemble_api_router_with_service(service, context).await?,
    ))
}

/// Canonical Web Module definition for this application
/// (`API_ASSEMBLY_SPEC.md` section 4.1.1): the complete HTTP surface — every
/// route, manifest, and OpenAPI document of this owner — as one installable
/// module.
///
/// # Errors
///
/// Returns the error propagated from [`assemble_api_router`].
pub async fn web_module() -> Result<WebModule, String> {
    Ok(WebModule::from_contribution(
        assemble_api_router(ApiAssemblyContext::default()).await?,
    ))
}
