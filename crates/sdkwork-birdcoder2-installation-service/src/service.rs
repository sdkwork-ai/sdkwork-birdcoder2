//! Projection of a verified installation identity into the About payload.
//!
//! The service holds the product slice, so one shared instance answers every
//! caller with the identity that installation froze at install time. It reads
//! no store and performs no lookup: the caller already proved which
//! installation it is by presenting the access token the gateway verified.

use crate::error::InstallationError;
use crate::model::{InstallationApplication, InstallationIdentity, InstallationProductProfile};

/// Resolves the installation application payload for one verified identity.
#[derive(Clone, Debug)]
pub struct InstallationApplicationService {
    product: InstallationProductProfile,
}

impl InstallationApplicationService {
    /// Wire a service to the product identity this deployment publishes.
    /// @param product - complete product profile.
    /// @returns the service.
    /// @throws `InstallationError::MissingProductField` when the profile is incomplete.
    pub fn new(product: InstallationProductProfile) -> Result<Self, InstallationError> {
        product.validate()?;
        Ok(Self { product })
    }

    /// The service with this repository's shipped BirdCoder profile.
    ///
    /// Infallible because the shipped profile's required fields are non-empty
    /// literals; [`InstallationProductProfile::validate`] still covers a profile
    /// a composing host substitutes, and the crate's tests pin this constructor
    /// to the same validation.
    /// @returns the service for the shipped product identity.
    #[must_use]
    pub fn shipped() -> Self {
        Self {
            product: InstallationProductProfile::birdcoder(),
        }
    }

    /// The product identity the service publishes.
    /// @returns the product profile this deployment serves.
    #[must_use]
    pub fn product(&self) -> &InstallationProductProfile {
        &self.product
    }

    /// Project one verified installation identity onto the wire payload.
    /// @param identity - identity resolved from the verified request context.
    /// @returns the About payload for that installation.
    #[must_use]
    pub fn resolve(&self, identity: &InstallationIdentity) -> InstallationApplication {
        InstallationApplication {
            app_id: identity.app_id.clone(),
            tenant_id: identity.tenant_id.clone(),
            organization_id: identity.organization_id.clone(),
            release_scope: identity.release_scope,
            environment: identity.environment,
            deployment_mode: identity.deployment_mode,
            product: self.product.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{
        InstallationDeploymentMode, InstallationEnvironment, InstallationReleaseScope,
    };

    fn identity() -> InstallationIdentity {
        let identity = InstallationIdentity::new(
            "app_01a18b4f",
            "100001",
            "0",
            InstallationReleaseScope::Tenant,
            InstallationEnvironment::Production,
            InstallationDeploymentMode::Saas,
        );
        assert!(identity.is_ok());
        match identity {
            Ok(identity) => identity,
            Err(_) => InstallationIdentity {
                app_id: String::new(),
                tenant_id: String::new(),
                organization_id: String::new(),
                release_scope: InstallationReleaseScope::Tenant,
                environment: InstallationEnvironment::Development,
                deployment_mode: InstallationDeploymentMode::Local,
            },
        }
    }

    #[test]
    fn resolve_publishes_the_verified_identity_and_the_product_slice() {
        let service = InstallationApplicationService::new(InstallationProductProfile::birdcoder());
        assert!(service.is_ok());
        let Ok(service) = service else { return };
        let application = service.resolve(&identity());
        assert_eq!(application.app_id, "app_01a18b4f");
        assert_eq!(application.tenant_id, "100001");
        assert_eq!(application.organization_id, "0");
        assert_eq!(application.release_scope, InstallationReleaseScope::Tenant);
        assert_eq!(application.environment, InstallationEnvironment::Production);
        assert_eq!(
            application.deployment_mode,
            InstallationDeploymentMode::Saas
        );
        assert_eq!(application.product.app_key, "sdkwork-birdcoder2");
        assert_eq!(application.product.name, service.product().name);
    }

    #[test]
    fn shipped_profile_satisfies_the_same_validation() {
        assert_eq!(InstallationProductProfile::birdcoder().validate(), Ok(()));
        assert_eq!(
            InstallationApplicationService::shipped().product().app_key,
            "sdkwork-birdcoder2"
        );
    }

    #[test]
    fn construction_rejects_an_incomplete_profile() {
        let mut product = InstallationProductProfile::birdcoder();
        product.app_key = "  ".to_owned();
        assert!(matches!(
            InstallationApplicationService::new(product),
            Err(InstallationError::MissingProductField { field: "appKey" })
        ));
    }
}
