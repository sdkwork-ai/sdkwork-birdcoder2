//! API assembly bootstrap for sdkwork-birdcoder2.

use axum::Router;
use std::sync::Arc;
use sdkwork_web_bootstrap::{ApiAssemblyContribution, ReadinessCheck, WebModule};
use sdkwork_web_core::{DomainContextInjector, HttpRouteManifest};

pub type ApiAssembly = ApiAssemblyContribution;

pub struct ApiAssemblyContext {
    pub domain_context_injectors: Vec<Arc<dyn DomainContextInjector>>,
    pub readiness_check: Arc<dyn ReadinessCheck>,
}

pub async fn assemble_api_router(context: ApiAssemblyContext) -> Result<ApiAssembly, String> {
    ApiAssemblyContribution::from_manifest(
        "sdkwork-birdcoder2",
        "SDKWork birdcoder2 API",
        Router::new(),
        HttpRouteManifest::from_owned_routes(Vec::new()),
        context.domain_context_injectors,
        context.readiness_check,
    )
}

/// Installs this application as a Web Module with caller-supplied assembly
/// context (API_ASSEMBLY_SPEC §4.1.1).
pub async fn web_module_with_context(
    context: ApiAssemblyContext,
) -> Result<WebModule, String> {
    Ok(WebModule::from_contribution(assemble_api_router(context).await?))
}

/// Canonical Web Module definition for this application
/// (API_ASSEMBLY_SPEC §4.1.1): the complete HTTP surface — every route,
/// manifest, and OpenAPI document of this owner — as one installable module.
pub async fn web_module() -> Result<WebModule, String> {
    web_module_with_context(ApiAssemblyContext {
        domain_context_injectors: Vec::new(),
        readiness_check: Arc::new(sdkwork_web_bootstrap::AlwaysReady),
    })
    .await
}
