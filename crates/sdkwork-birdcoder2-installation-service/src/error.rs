//! Typed failures of the installation application projection.
//!
//! Every variant is a configuration or credential defect: an access token that
//! names no installation, a claim vocabulary this build does not know, or a
//! product profile the composing host left incomplete. The route crate maps
//! each variant onto the platform error contract exactly once.

/// A release identity fact that is absent or inconsistent.
#[derive(Debug, Eq, PartialEq, thiserror::Error)]
pub enum InstallationError {
    /// The verified request context carries no value for the named identity field.
    #[error("the access token names no {field}")]
    MissingIdentityField {
        /// Wire field that was required, for example `appId`.
        field: &'static str,
    },
    /// The token carries a release scope this build does not recognize.
    #[error("unknown installation release scope {value:?}")]
    UnknownReleaseScope {
        /// Claim value as received.
        value: String,
    },
    /// The token carries a lifecycle environment this build does not recognize.
    #[error("unknown installation environment {value:?}")]
    UnknownEnvironment {
        /// Claim value as received.
        value: String,
    },
    /// The token carries a deployment mode this build does not recognize.
    #[error("unknown installation deployment mode {value:?}")]
    UnknownDeploymentMode {
        /// Claim value as received.
        value: String,
    },
    /// The supplied product profile omits a field the About surface renders.
    #[error("the installation product profile declares no {field}")]
    MissingProductField {
        /// Profile field that was required, for example `name`.
        field: &'static str,
    },
}
