//! Domain-to-wire error mapping for the installation App API surface.
//!
//! The mapping is applied exactly once so no handler invents a status: an
//! unresolved installation is a credential defect (the verified context names
//! no installation), an unknown claim vocabulary is an invalid credential, and
//! an incomplete product profile is a deployment defect the caller cannot fix.

use sdkwork_birdcoder2_installation_service::InstallationError;
use sdkwork_web_core::WebFrameworkError;

/// Projects an installation-projection failure onto the platform error contract.
/// @param error - domain failure to map.
/// @returns the framework error carrying the response status and result code.
#[must_use]
pub fn to_framework_error(error: InstallationError) -> WebFrameworkError {
    match &error {
        InstallationError::MissingIdentityField { field } => {
            WebFrameworkError::missing_credentials(format!("the access token names no {field}"))
        }
        InstallationError::MissingProductField { field } => {
            WebFrameworkError::internal_server_error(format!(
                "the installation product profile declares no {field}"
            ))
        }
        InstallationError::UnknownReleaseScope { .. }
        | InstallationError::UnknownEnvironment { .. }
        | InstallationError::UnknownDeploymentMode { .. } => {
            WebFrameworkError::invalid_credentials(error.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sdkwork_web_core::WebFrameworkErrorKind;

    #[test]
    fn missing_identity_is_a_credential_failure() {
        let error = to_framework_error(InstallationError::MissingIdentityField { field: "appId" });
        assert_eq!(error.kind, WebFrameworkErrorKind::MissingCredentials);
    }

    #[test]
    fn unknown_claim_vocabulary_is_an_invalid_credential() {
        let error = to_framework_error(InstallationError::UnknownReleaseScope {
            value: "PLATFORM".to_owned(),
        });
        assert_eq!(error.kind, WebFrameworkErrorKind::InvalidCredentials);
    }

    #[test]
    fn incomplete_product_profile_is_a_server_defect() {
        let error = to_framework_error(InstallationError::MissingProductField { field: "name" });
        assert_eq!(error.kind, WebFrameworkErrorKind::InternalServerError);
    }
}
