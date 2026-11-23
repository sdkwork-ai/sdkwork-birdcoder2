//! Wire-facing identity of one installation.
//!
//! The vocabulary mirrors the platform contracts rather than inventing a second
//! one: `releaseScope` is the signed `ownership_scope` claim
//! (`APPLICATION_IDENTITY_SPEC.md` section 4.1), `environment` is the SDKWork
//! lifecycle tier, and `deploymentMode` is the application runtime topology
//! (SaaS, private, or local). The product slice is the part of the identity an
//! installation freezes when it is created; a redeployment with another
//! display identity therefore answers with the identity it was installed with.

use serde::{Deserialize, Serialize};

use crate::error::InstallationError;

/// The tenant-level organization sentinel (`API_SPEC.md` section 10.4).
const TENANT_LEVEL_ORGANIZATION_ID: &str = "0";

/// Release scope of the installation that issued the credential.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum InstallationReleaseScope {
    /// The installation serves its whole tenant.
    #[serde(rename = "TENANT")]
    Tenant,
    /// The installation serves one organization of its tenant.
    #[serde(rename = "ORGANIZATION")]
    Organization,
    /// The installation serves one personal owner.
    #[serde(rename = "USER")]
    User,
}

impl InstallationReleaseScope {
    /// Parse the signed claim vocabulary.
    /// @param value - claim value as received.
    /// @returns the scope, or `None` for a value this build does not know.
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "TENANT" => Some(Self::Tenant),
            "ORGANIZATION" => Some(Self::Organization),
            "USER" => Some(Self::User),
            _ => None,
        }
    }

    /// Resolve the scope a verified context reports.
    ///
    /// An absent claim keeps the legacy derivation, which never yields `USER`:
    /// the tenant sentinel maps to `TENANT` and any other organization maps to
    /// `ORGANIZATION` (`APPLICATION_IDENTITY_SPEC.md` section 4.1 rule 6).
    /// @param claim - `ownership_scope` when the token carried it.
    /// @param organization_scope - resolved organization id, `0` for tenant level.
    /// @returns the release scope.
    /// @throws `InstallationError::UnknownReleaseScope` for an unrecognized claim.
    pub fn resolve(
        claim: Option<&str>,
        organization_scope: &str,
    ) -> Result<Self, InstallationError> {
        match claim.map(str::trim) {
            None | Some("") => Ok(
                if organization_scope.trim() == TENANT_LEVEL_ORGANIZATION_ID {
                    Self::Tenant
                } else {
                    Self::Organization
                },
            ),
            Some(value) => {
                Self::parse(value).ok_or_else(|| InstallationError::UnknownReleaseScope {
                    value: value.to_owned(),
                })
            }
        }
    }

    /// The wire value.
    /// @returns `TENANT`, `ORGANIZATION`, or `USER`.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tenant => "TENANT",
            Self::Organization => "ORGANIZATION",
            Self::User => "USER",
        }
    }
}

/// Lifecycle environment the installation was registered for.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InstallationEnvironment {
    /// Source and shared development deployment.
    Development,
    /// Test or staging deployment.
    Testing,
    /// Production deployment.
    Production,
}

impl InstallationEnvironment {
    /// Map the verified token's environment vocabulary onto the lifecycle tier.
    /// @param value - `dev`, `test`, or `prod` (the platform's claim vocabulary).
    /// @returns the lifecycle tier, or `None` for an unknown value.
    #[must_use]
    pub fn from_token_environment(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "dev" | "development" => Some(Self::Development),
            "test" | "testing" | "staging" => Some(Self::Testing),
            "prod" | "production" => Some(Self::Production),
            _ => None,
        }
    }

    /// The wire value.
    /// @returns `development`, `testing`, or `production`.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Development => "development",
            Self::Testing => "testing",
            Self::Production => "production",
        }
    }
}

/// Application runtime topology of the installation.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InstallationDeploymentMode {
    /// Hosted by the platform.
    Saas,
    /// Dedicated deployment owned by the tenant.
    Private,
    /// Local or standalone runtime.
    Local,
}

impl InstallationDeploymentMode {
    /// Map the verified token's deployment vocabulary onto the runtime mode.
    /// @param value - `saas`, `private`, or `local`.
    /// @returns the deployment mode, or `None` for an unknown value.
    #[must_use]
    pub fn from_token_deployment_mode(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "saas" => Some(Self::Saas),
            "private" => Some(Self::Private),
            "local" => Some(Self::Local),
            _ => None,
        }
    }

    /// The wire value.
    /// @returns `saas`, `private`, or `local`.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Saas => "saas",
            Self::Private => "private",
            Self::Local => "local",
        }
    }
}

/// Identity of the installation a verified access token names.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InstallationIdentity {
    /// Deploy application anchor (the token's `app_id`).
    pub app_id: String,
    /// Tenant the installation belongs to.
    pub tenant_id: String,
    /// Resolved organization scope; `0` for a tenant-level installation.
    pub organization_id: String,
    /// Release scope the credential was issued for.
    pub release_scope: InstallationReleaseScope,
    /// Lifecycle environment the installation was registered for.
    pub environment: InstallationEnvironment,
    /// Application runtime topology.
    pub deployment_mode: InstallationDeploymentMode,
}

impl InstallationIdentity {
    /// Build an identity once every required fact is present and known.
    /// @param app_id - deploy application anchor.
    /// @param tenant_id - tenant the installation belongs to.
    /// @param organization_id - resolved organization scope (`0` for tenant level).
    /// @param release_scope - resolved release scope.
    /// @param environment - resolved lifecycle environment.
    /// @param deployment_mode - resolved runtime topology.
    /// @returns the identity.
    /// @throws `InstallationError::MissingIdentityField` for a blank required field.
    pub fn new(
        app_id: impl Into<String>,
        tenant_id: impl Into<String>,
        organization_id: impl Into<String>,
        release_scope: InstallationReleaseScope,
        environment: InstallationEnvironment,
        deployment_mode: InstallationDeploymentMode,
    ) -> Result<Self, InstallationError> {
        Ok(Self {
            app_id: required("appId", app_id.into())?,
            tenant_id: required("tenantId", tenant_id.into())?,
            organization_id: organization_id.into().trim().to_owned(),
            release_scope,
            environment,
            deployment_mode,
        })
    }
}

fn required(field: &'static str, value: String) -> Result<String, InstallationError> {
    let value = value.trim().to_owned();
    if value.is_empty() {
        return Err(InstallationError::MissingIdentityField { field });
    }
    Ok(value)
}

/// Product slice of the identity an installation freezes at install time.
///
/// The shipped values are the BirdCoder identity from `agent.app.config.json`.
/// A deployment that ships another display identity supplies its own profile
/// through the API assembly context; this crate keeps no second brand switch.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationProductProfile {
    /// Display name of the product.
    pub name: String,
    /// Vendor that publishes the product.
    pub vendor: String,
    /// Stable product key the deployment reports to platform collectors.
    pub app_key: String,
    /// Absolute URL of the product mark.
    pub icon_url: String,
    /// Public product website.
    pub website_url: String,
    /// Support entry point.
    pub support_url: String,
    /// Privacy policy.
    pub privacy_policy_url: String,
    /// Terms of service.
    pub terms_of_service_url: String,
}

impl InstallationProductProfile {
    /// The shipped BirdCoder identity (`agent.app.config.json`).
    /// @returns the product profile this repository deploys by default.
    #[must_use]
    pub fn birdcoder() -> Self {
        Self {
            name: "SDKWork Birdcoder".to_owned(),
            vendor: "SDKWORK".to_owned(),
            app_key: "sdkwork-birdcoder2".to_owned(),
            icon_url: "https://cdn.sdkwork.com/apps/sdkwork-birdcoder/assets/icon-1024.png"
                .to_owned(),
            website_url: "https://www.birdcoder.com".to_owned(),
            support_url: "https://www.birdcoder.com/docs/support".to_owned(),
            privacy_policy_url: "https://www.birdcoder.com/docs/privacy".to_owned(),
            terms_of_service_url: "https://www.birdcoder.com/docs/terms".to_owned(),
        }
    }

    /// Check the fields an About surface cannot render without.
    /// @returns `Ok(())` when the profile is complete.
    /// @throws `InstallationError::MissingProductField` for a blank required field.
    pub fn validate(&self) -> Result<(), InstallationError> {
        for (field, value) in [
            ("name", self.name.as_str()),
            ("vendor", self.vendor.as_str()),
            ("appKey", self.app_key.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(InstallationError::MissingProductField { field });
            }
        }
        Ok(())
    }
}

/// The installation application the About surface shows.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationApplication {
    /// Deploy application anchor (the token's `app_id`).
    pub app_id: String,
    /// Tenant the installation belongs to.
    pub tenant_id: String,
    /// Resolved organization scope; `0` for a tenant-level installation.
    pub organization_id: String,
    /// Release scope the credential was issued for.
    pub release_scope: InstallationReleaseScope,
    /// Lifecycle environment the installation was registered for.
    pub environment: InstallationEnvironment,
    /// Application runtime topology.
    pub deployment_mode: InstallationDeploymentMode,
    /// Product identity frozen at install time.
    pub product: InstallationProductProfile,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_scope_prefers_the_signed_claim() {
        assert_eq!(
            InstallationReleaseScope::resolve(Some("USER"), "0"),
            Ok(InstallationReleaseScope::User)
        );
        assert_eq!(
            InstallationReleaseScope::resolve(Some("ORGANIZATION"), "42"),
            Ok(InstallationReleaseScope::Organization)
        );
    }

    #[test]
    fn release_scope_derives_the_legacy_tiers_from_the_organization() {
        assert_eq!(
            InstallationReleaseScope::resolve(None, "0"),
            Ok(InstallationReleaseScope::Tenant)
        );
        assert_eq!(
            InstallationReleaseScope::resolve(Some("  "), "42"),
            Ok(InstallationReleaseScope::Organization)
        );
    }

    #[test]
    fn release_scope_rejects_an_unknown_claim() {
        assert!(matches!(
            InstallationReleaseScope::resolve(Some("PLATFORM"), "0"),
            Err(InstallationError::UnknownReleaseScope { .. })
        ));
    }

    #[test]
    fn token_vocabulary_maps_onto_lifecycle_tiers() {
        assert_eq!(
            InstallationEnvironment::from_token_environment("prod"),
            Some(InstallationEnvironment::Production)
        );
        assert_eq!(
            InstallationEnvironment::from_token_environment(" Dev "),
            Some(InstallationEnvironment::Development)
        );
        assert_eq!(InstallationEnvironment::from_token_environment("qa"), None);
        assert_eq!(
            InstallationDeploymentMode::from_token_deployment_mode("PRIVATE"),
            Some(InstallationDeploymentMode::Private)
        );
        assert_eq!(
            InstallationDeploymentMode::from_token_deployment_mode("edge"),
            None
        );
    }

    #[test]
    fn identity_rejects_blank_required_fields() {
        let missing = InstallationIdentity::new(
            "  ",
            "100001",
            "0",
            InstallationReleaseScope::Tenant,
            InstallationEnvironment::Development,
            InstallationDeploymentMode::Saas,
        );
        assert!(matches!(
            missing,
            Err(InstallationError::MissingIdentityField { field: "appId" })
        ));
        let missing_tenant = InstallationIdentity::new(
            "app_1",
            "",
            "0",
            InstallationReleaseScope::Tenant,
            InstallationEnvironment::Development,
            InstallationDeploymentMode::Saas,
        );
        assert!(matches!(
            missing_tenant,
            Err(InstallationError::MissingIdentityField { field: "tenantId" })
        ));
    }

    #[test]
    fn identity_normalizes_optional_scope_fields() {
        let identity = InstallationIdentity::new(
            " app_1 ",
            "100001",
            " ",
            InstallationReleaseScope::Tenant,
            InstallationEnvironment::Testing,
            InstallationDeploymentMode::Local,
        );
        assert!(identity.is_ok());
        if let Ok(identity) = identity {
            assert_eq!(identity.app_id, "app_1");
            assert_eq!(identity.organization_id, "");
        }
    }

    #[test]
    fn product_profile_requires_name_vendor_and_key() {
        let mut profile = InstallationProductProfile::birdcoder();
        assert_eq!(profile.validate(), Ok(()));
        profile.name = String::new();
        assert!(matches!(
            profile.validate(),
            Err(InstallationError::MissingProductField { field: "name" })
        ));
    }
}
