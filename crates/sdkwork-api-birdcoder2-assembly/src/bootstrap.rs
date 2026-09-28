//! API assembly bootstrap for sdkwork-birdcoder2.
//!
//! The assembly exports the indivisible [`ApiAssemblyContribution`] contract
//! (`API_ASSEMBLY_SPEC.md` section 4): one router, one merged route manifest, the
//! domain context injectors, and the readiness check — never a bare `Router`.
//!
//! # The two surfaces are one application
//!
//! BirdCoder2 owns exactly two HTTP surfaces and they are two ends of one
//! connection:
//!
//! - `sdkwork-routes-birdcoder2-app-api` is the **mobile** end: the owner's H5
//!   client registers hosts and drives agent conversations;
//! - `sdkwork-routes-birdcoder2-internal-api` is the **host** end: the runtime
//!   running on Windows/Linux/macOS, in Docker, or in a cloud `sdkwork-sandbox`
//!   attaches, takes a lease, claims turns, and pushes agent events back.
//!
//! Both are mounted here against **one** [`HostRuntimeService`] instance. That
//! sharing is load-bearing: a host that redeems a pairing code on the internal
//! surface must appear in the owner's registry on the mobile surface in the same
//! process, and a lease minted for a host must resolve the turns the owner
//! enqueued. Two instances would break every relay step.
//!
//! # Composition
//!
//! The bootstrap applies no web-framework layer. The composing gateway installs
//! it, which is what classifies each call as `app-api` or `internal-api`,
//! authenticates it (dual token versus ingress token), and injects the verified
//! request context both surfaces' handlers require. A mount used without that
//! layer therefore rejects every request instead of serving tenant data.
//!
//! Storage: the service's in-memory store is the standalone/test adapter. A
//! SQLx-backed repository is the next increment and slots in behind
//! [`assemble_api_router_with_service`] without touching a call site.

use std::sync::Arc;

use axum::Router;
use sdkwork_birdcoder2_host_runtime_service::HostRuntimeService;
use sdkwork_web_bootstrap::{ApiAssemblyContribution, ReadinessCheck, WebModule};
use sdkwork_web_core::{DomainContextInjector, HttpRouteManifest};

use sdkwork_routes_birdcoder2_app_api as birdcoder2_app_api;
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
}

impl Default for ApiAssemblyContext {
    fn default() -> Self {
        Self {
            domain_context_injectors: Vec::new(),
            readiness_check: Arc::new(sdkwork_web_bootstrap::AlwaysReady),
        }
    }
}

/// Builds the router carrying both surfaces against one shared service.
///
/// The two mounts are merged as local values, not as
/// `router.merge(sdkwork_routes_…)` calls: a gateway host must never hand-merge a
/// route crate by name (the API assembly owns route ownership), so the surface
/// adapters are the only place the crate names appear.
fn birdcoder2_router(service: Arc<HostRuntimeService>) -> Router {
    let app_api = birdcoder2_app_api::gateway_mount_business(Arc::clone(&service));
    let internal_api = birdcoder2_internal_api::gateway_mount_business(service);
    Router::new().merge(app_api).merge(internal_api)
}

/// Merges both surfaces' route manifests into the application's published set.
///
/// The gateway reads this to classify and authorize each call, so a surface
/// whose manifest is missing here would be served unauthenticated or not at all.
fn birdcoder2_route_manifest() -> HttpRouteManifest {
    let mut routes = birdcoder2_app_api::gateway_route_manifest()
        .routes()
        .to_vec();
    routes.extend_from_slice(birdcoder2_internal_api::gateway_route_manifest().routes());
    HttpRouteManifest::from_owned_routes(routes)
}

/// Assembles the contribution against a caller-supplied service instance, so a
/// composing host can share one registry with the rest of its process.
///
/// # Errors
///
/// Returns the contribution validator's message — an unknown owner prefix, an
/// auth-shape mismatch, or an empty public path set.
pub async fn assemble_api_router_with_service(
    service: Arc<HostRuntimeService>,
    context: ApiAssemblyContext,
) -> Result<ApiAssembly, String> {
    ApiAssemblyContribution::from_manifest(
        "sdkwork-birdcoder2",
        "SDKWork BirdCoder2 API",
        birdcoder2_router(service),
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
