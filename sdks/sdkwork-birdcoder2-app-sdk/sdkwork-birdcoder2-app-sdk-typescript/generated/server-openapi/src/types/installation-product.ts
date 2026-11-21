/** Product identity an installation freezes when it is created. */
export interface InstallationProduct {
  /** Display name of the product. */
  name: string;
  /** Vendor that publishes the product. */
  vendor: string;
  /** Stable product key the deployment reports to platform collectors. */
  appKey: string;
  /** Absolute URL of the product mark. */
  iconUrl: string;
  /** Public product website. */
  websiteUrl: string;
  /** Support entry point. */
  supportUrl: string;
  /** Privacy policy. */
  privacyPolicyUrl: string;
  /** Terms of service. */
  termsOfServiceUrl: string;
}
