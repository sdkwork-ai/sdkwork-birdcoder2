//! API assembly for sdkwork-birdcoder2.
//! Application bootstrap lives in `bootstrap.rs`; route inventory is in `assembly-manifest.json`.
//! SDKWORK-ASSEMBLY-LIB-CUSTOM: exports beyond the canonical materializer template.

mod bootstrap;
mod generated;

pub use bootstrap::{
    assemble_api_router, assemble_api_router_with_service, web_module, web_module_with_service,
    ApiAssembly, ApiAssemblyContext,
};

pub fn assembly_route_count() -> usize {
    generated::ROUTE_CRATE_COUNT
}
