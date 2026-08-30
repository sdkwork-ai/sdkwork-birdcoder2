//! API assembly bootstrap for sdkwork-birdcoder2.

use axum::Router;
use std::sync::Arc;
use sdkwork_web_bootstrap::{ApiAssemblyContribution, ReadinessCheck};
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
