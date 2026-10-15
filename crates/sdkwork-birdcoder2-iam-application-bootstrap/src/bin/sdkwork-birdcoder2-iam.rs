//! `sdkwork-birdcoder2-iam` — provision this repository's IAM tenant applications.
//!
//! Idempotent: the shared embedded bootstrap upserts the application template and
//! the tenant application for every manifest under this repository's root, so
//! running it again after a database reset, a manifest change, or a fresh clone
//! restores the same enabled rows. It skips cleanly when no workspace PostgreSQL
//! profile is configured, so a checkout without the platform database still
//! builds and runs.

use std::path::Path;

use sdkwork_birdcoder2_iam_application_bootstrap::{
    ensure_birdcoder2_tenant_application_runtime_from_env, resolve_birdcoder2_environment,
    resolve_birdcoder2_repo_root,
};
use sdkwork_database_config::workspace_database::workspace_postgres_env_is_configured;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let app_root = resolve_birdcoder2_repo_root();
    // The resolver canonicalizes, which prefixes a Windows path with `\\?\`;
    // the diagnostic names a human-readable repository root.
    let display = app_root.display().to_string();
    let display = display.strip_prefix(r"\\?\").unwrap_or(&display);
    if !workspace_database_is_configured(app_root.as_path()) {
        println!(
            "sdkwork-birdcoder2-iam: no workspace PostgreSQL profile for {display}; skipping tenant application provisioning",
        );
        return Ok(());
    }

    ensure_birdcoder2_tenant_application_runtime_from_env()
        .await
        .map_err(|message| -> Box<dyn std::error::Error + Send + Sync> { message.into() })?;
    println!(
        "sdkwork-birdcoder2-iam: tenant applications ensured for {display} ({})",
        resolve_birdcoder2_environment()
    );
    Ok(())
}

/// Whether the process environment or this repository carries a workspace database profile.
/// @param app_root - repository root owning the optional `.env.postgres`.
/// @returns true when the shared bootstrap has a database to provision against.
fn workspace_database_is_configured(app_root: &Path) -> bool {
    workspace_postgres_env_is_configured() || app_root.join(".env.postgres").is_file()
}
