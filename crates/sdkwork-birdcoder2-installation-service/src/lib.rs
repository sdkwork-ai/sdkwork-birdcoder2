#![forbid(unsafe_code)]
//! BirdCoder2 **installation application identity**.
//!
//! # Why this module exists
//!
//! A public application access token names exactly one *installation*: the
//! tenant's installed instance of this product, bound one-to-one to a deploy
//! application (`APPLICATION_IDENTITY_SPEC.md` section 4). The About surface
//! answers "which application is this, and which installation does my token
//! belong to", so it needs that identity as data rather than as a sentence.
//!
//! The composing gateway verifies the token and resolves a
//! `WebRequestContext`; this crate owns the domain projection of that verified
//! context: the release scope the credential was issued for, the lifecycle
//! environment, the deployment mode, and the product slice an installation
//! freezes at install time. It performs no authentication and reads no request
//! header: a caller that has no verified identity has no installation to
//! report.
//!
//! # Boundaries
//!
//! - Route ownership (paths, operation ids, auth shape) lives in
//!   `sdkwork-routes-birdcoder2-installation-app-api`;
//! - the merging API assembly lives in `sdkwork-api-birdcoder2-assembly`;
//! - the generated TypeScript transport lives in
//!   `sdks/sdkwork-birdcoder2-app-sdk`.
//!
//! The product profile ([`InstallationProductProfile`]) is supplied by the
//! composing host, so a deployment that ships a different display identity
//! changes it without editing this crate. [`InstallationProductProfile::birdcoder`]
//! is the shipped BirdCoder identity declared by `agent.app.config.json`
//! (`app.name`, `app.officialWebsiteUrl`, `app.supportUrl`,
//! `app.privacyPolicyUrl`, `app.termsOfServiceUrl`, `app.iconUrl`).

mod error;
mod model;
mod service;

pub use error::InstallationError;
pub use model::{
    InstallationApplication, InstallationDeploymentMode, InstallationEnvironment,
    InstallationIdentity, InstallationProductProfile, InstallationReleaseScope,
};
pub use service::InstallationApplicationService;
