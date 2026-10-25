//! Thin BirdCoder2 adapter over the shared embedded IAM tenant application bootstrap.
//!
//! The harness authenticates to the SDKWork platform as `sdkwork-birdcoder`
//! under tenant `100001`, so the IAM `iam_tenant_application` row for this
//! repository's manifest root must exist and be enabled before the first
//! authenticated request. Without it the platform answers
//! `runtime appId sdkwork-birdcoder is not provisioned for tenant 100001`.
//!
//! This crate owns that provisioning for BirdCoder2 and copies none of the
//! canonical IAM logic: registration, manifest binding, and tenant application
//! writes stay in `sdkwork_iam_embedded_application_bootstrap`, which is the
//! same implementation the platform gateway runs for its own manifest root.

use std::path::PathBuf;

use sdkwork_iam_embedded_application_bootstrap::{
    ensure_tenant_application_from_app_root_with_env_and_fallback,
    ensure_tenant_applications_from_app_root_on_pool, resolve_application_app_root,
    resolve_bootstrap_environment, EmbeddedApplicationBootstrapOptions,
};
use sqlx::PgPool;

/// Lifecycle environment recorded on the provisioned tenant applications.
///
/// Resolution order is the shared crate's (`SDKWORK_CLOUDROUTER_ENVIRONMENT`,
/// `SDKWORK_CLOUDROUTER_INSTALL_ENVIRONMENT`, `SDKWORK_ENVIRONMENT`, `NODE_ENV`),
/// with `development` as the fallback a local source checkout relies on.
/// @returns the lifecycle environment name.
#[must_use]
pub fn resolve_birdcoder2_environment() -> String {
    resolve_bootstrap_environment()
}

/// Repository root owning this application's `agent.app.config.json`.
///
/// `SDKWORK_APP_ROOT` wins so a launcher that already resolved a root keeps one
/// answer; otherwise the crate's own location resolves the repository, which is
/// what a developer running `pnpm run iam:ensure` from a checkout gets.
/// @returns the absolute repository root.
#[must_use]
pub fn resolve_birdcoder2_repo_root() -> PathBuf {
    resolve_application_app_root().unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."))
    })
}

/// Provisions every runtime application this repository's manifests declare, on a caller pool.
///
/// The root manifest declares `sdkwork-birdcoder`; each surface under `apps/`
/// declares its own runtime identity, and the shared discovery walks both.
/// @param pg - PostgreSQL pool carrying the IAM schema.
/// @param environment - lifecycle environment recorded on the rows.
/// @returns `Ok(())` once every declared application is provisioned and enabled.
/// @throws Never panics; the shared bootstrap's message is returned as `Err`.
pub async fn ensure_birdcoder2_tenant_application_runtime(
    pg: &PgPool,
    environment: &str,
) -> Result<(), String> {
    let options = EmbeddedApplicationBootstrapOptions {
        environment: environment.to_owned(),
        ..EmbeddedApplicationBootstrapOptions::default()
    };
    ensure_tenant_applications_from_app_root_on_pool(
        pg,
        resolve_birdcoder2_repo_root().as_path(),
        &options,
        None,
        &[],
    )
    .await
}

/// Provisions from the workspace PostgreSQL profile, connecting its own pool.
///
/// The caller must confirm a database is configured first: applying an
/// unconfigured workspace profile has no answer to give and stops the process.
/// @returns `Ok(())` once every declared application is provisioned and enabled.
/// @throws Never panics on an IAM failure; that message is returned as `Err`.
pub async fn ensure_birdcoder2_tenant_application_runtime_from_env() -> Result<(), String> {
    let app_root = resolve_birdcoder2_repo_root();
    sdkwork_iam_database_host::unified_postgres_env::apply_workspace_postgres_env(&app_root);
    ensure_tenant_application_from_app_root_with_env_and_fallback(
        resolve_birdcoder2_environment().as_str(),
        app_root,
        None,
        &[],
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sdkwork_iam_embedded_application_bootstrap::{
        discover_application_manifest_roots, load_manifest_from_app_root,
        resolve_manifest_runtime_app_bindings,
    };

    #[test]
    fn repo_root_resolves_the_repository_manifest() {
        let root = resolve_birdcoder2_repo_root();
        assert!(root.join("agent.app.config.json").is_file());
    }

    #[test]
    fn repository_manifests_declare_the_runtime_identities() {
        let repo_root = resolve_birdcoder2_repo_root();
        let manifest_roots =
            discover_application_manifest_roots(repo_root.as_path()).expect("manifest roots");
        let declared = manifest_roots
            .into_iter()
            .flat_map(|manifest_root| {
                let manifest =
                    load_manifest_from_app_root(manifest_root.as_path()).expect("manifest");
                resolve_manifest_runtime_app_bindings(&manifest)
                    .into_iter()
                    .map(|binding| binding.runtime_app_id)
            })
            .collect::<Vec<_>>();

        assert!(declared.contains(&"sdkwork-birdcoder".to_owned()));
    }
}
