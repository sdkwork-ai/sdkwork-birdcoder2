//! Projection of a verified principal onto the installation identity.
//!
//! Every fact comes from the context the composing gateway injected after it
//! verified the credential: the deploy application anchor, the tenant, the
//! resolved organization scope, the release scope claim (or its legacy
//! derivation), and the environment and deployment mode the resolver recorded.
//! Nothing is read from the request itself.

use sdkwork_birdcoder2_installation_service::{
    InstallationDeploymentMode, InstallationEnvironment, InstallationIdentity,
    InstallationReleaseScope,
};
use sdkwork_web_core::{WebDeploymentMode, WebEnvironment, WebFrameworkError, WebRequestPrincipal};

use crate::errors::to_framework_error;

/// Resolve the installation identity a verified principal names.
/// @param principal - verified request identity injected by the gateway.
/// @returns the installation identity.
/// @throws `WebFrameworkError` when a required fact is absent or an unknown claim
/// vocabulary reached this build; the error mapping lives in [`crate::errors`].
pub fn installation_identity(
    principal: &WebRequestPrincipal,
) -> Result<InstallationIdentity, WebFrameworkError> {
    let environment = match principal.app.environment {
        WebEnvironment::Dev => InstallationEnvironment::Development,
        WebEnvironment::Test => InstallationEnvironment::Testing,
        WebEnvironment::Prod => InstallationEnvironment::Production,
    };
    let deployment_mode = match principal.app.deployment_mode {
        WebDeploymentMode::Saas => InstallationDeploymentMode::Saas,
        WebDeploymentMode::Private => InstallationDeploymentMode::Private,
        WebDeploymentMode::Local => InstallationDeploymentMode::Local,
    };
    let organization_id = principal.organization_scope();
    let release_scope =
        InstallationReleaseScope::resolve(principal.ownership_scope(), &organization_id)
            .map_err(to_framework_error)?;
    InstallationIdentity::new(
        principal.app_id(),
        principal.tenant_id(),
        organization_id,
        release_scope,
        environment,
        deployment_mode,
    )
    .map_err(to_framework_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sdkwork_web_core::{WebDeploymentMode, WebEnvironment, WebRequestPrincipal};

    fn principal() -> WebRequestPrincipal {
        WebRequestPrincipal::builder()
            .tenant_id("100001")
            .user_id("1")
            .app_id("app_01a18b4f")
            .environment(WebEnvironment::Prod)
            .deployment_mode(WebDeploymentMode::Saas)
            .ownership_scope(Some("TENANT".to_owned()))
            .build()
    }

    #[test]
    fn resolves_the_identity_from_the_verified_principal() {
        let identity = installation_identity(&principal());
        assert!(identity.is_ok());
        if let Ok(identity) = identity {
            assert_eq!(identity.app_id, "app_01a18b4f");
            assert_eq!(identity.tenant_id, "100001");
            assert_eq!(identity.organization_id, "0");
            assert_eq!(identity.release_scope, InstallationReleaseScope::Tenant);
            assert_eq!(identity.environment, InstallationEnvironment::Production);
            assert_eq!(identity.deployment_mode, InstallationDeploymentMode::Saas);
        }
    }

    #[test]
    fn derives_the_release_scope_when_the_token_carries_none() {
        let value = WebRequestPrincipal::builder()
            .tenant_id("100001")
            .app_id("app_1")
            .organization_id(Some("42".to_owned()))
            .build();
        let identity = installation_identity(&value);
        assert!(identity.is_ok());
        if let Ok(identity) = identity {
            assert_eq!(
                identity.release_scope,
                InstallationReleaseScope::Organization
            );
        }
    }

    #[test]
    fn fails_closed_without_an_application_anchor() {
        let value = WebRequestPrincipal::builder()
            .tenant_id("100001")
            .user_id("1")
            .build();
        let error = installation_identity(&value);
        assert_eq!(
            error.map(|_| ()).map_err(|error| error.kind),
            Err(sdkwork_web_core::WebFrameworkErrorKind::MissingCredentials)
        );
    }

    #[test]
    fn rejects_an_unknown_release_scope_claim() {
        let value = WebRequestPrincipal::builder()
            .tenant_id("100001")
            .app_id("app_1")
            .ownership_scope(Some("PLATFORM".to_owned()))
            .build();
        let error = installation_identity(&value);
        assert_eq!(
            error.map(|_| ()).map_err(|error| error.kind),
            Err(sdkwork_web_core::WebFrameworkErrorKind::InvalidCredentials)
        );
    }
}
