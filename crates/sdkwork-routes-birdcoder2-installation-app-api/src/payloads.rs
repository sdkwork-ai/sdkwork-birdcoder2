//! Wire payload of the installation App API surface.
//!
//! The view keeps the OpenAPI authority and the served body in one place: the
//! domain model owns the values, this module owns field names and the product
//! slice's wire ordering. Enumerated values stay the domain enums because they
//! are the platform vocabulary rather than a transport concern.

use sdkwork_birdcoder2_installation_service::{
    InstallationApplication, InstallationDeploymentMode, InstallationEnvironment,
    InstallationProductProfile, InstallationReleaseScope,
};
use serde::Serialize;

/// The application identity the presented access token names.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationApplicationView {
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
    pub product: InstallationProductView,
}

impl From<&InstallationApplication> for InstallationApplicationView {
    fn from(application: &InstallationApplication) -> Self {
        Self {
            app_id: application.app_id.clone(),
            tenant_id: application.tenant_id.clone(),
            organization_id: application.organization_id.clone(),
            release_scope: application.release_scope,
            environment: application.environment,
            deployment_mode: application.deployment_mode,
            product: InstallationProductView::from(&application.product),
        }
    }
}

/// The product slice an installation freezes when it is created.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationProductView {
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

impl From<&InstallationProductProfile> for InstallationProductView {
    fn from(product: &InstallationProductProfile) -> Self {
        Self {
            name: product.name.clone(),
            vendor: product.vendor.clone(),
            app_key: product.app_key.clone(),
            icon_url: product.icon_url.clone(),
            website_url: product.website_url.clone(),
            support_url: product.support_url.clone(),
            privacy_policy_url: product.privacy_policy_url.clone(),
            terms_of_service_url: product.terms_of_service_url.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn view_serializes_the_platform_camel_case_contract() {
        let application = InstallationApplication {
            app_id: "app_1".to_owned(),
            tenant_id: "100001".to_owned(),
            organization_id: "0".to_owned(),
            release_scope: InstallationReleaseScope::Tenant,
            environment: InstallationEnvironment::Production,
            deployment_mode: InstallationDeploymentMode::Saas,
            product: InstallationProductProfile::birdcoder(),
        };
        let view = InstallationApplicationView::from(&application);
        let Ok(value) = serde_json::to_value(&view) else {
            return;
        };
        assert_eq!(value["appId"], "app_1");
        assert_eq!(value["releaseScope"], "TENANT");
        assert_eq!(value["environment"], "production");
        assert_eq!(value["deploymentMode"], "saas");
        assert_eq!(value["product"]["appKey"], "sdkwork-birdcoder2");
    }
}
