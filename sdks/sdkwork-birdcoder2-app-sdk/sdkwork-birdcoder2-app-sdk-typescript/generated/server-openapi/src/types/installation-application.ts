import type { InstallationDeploymentMode } from './installation-deployment-mode';
import type { InstallationEnvironment } from './installation-environment';
import type { InstallationProduct } from './installation-product';
import type { InstallationReleaseScope } from './installation-release-scope';

/** The application identity the presented access token names. */
export interface InstallationApplication {
  /** Deploy application anchor (the token app_id claim). */
  appId: string;
  /** Tenant the installation belongs to. */
  tenantId: string;
  /** Resolved organization scope; 0 for a tenant-level installation. */
  organizationId: string;
  releaseScope: InstallationReleaseScope;
  environment: InstallationEnvironment;
  deploymentMode: InstallationDeploymentMode;
  product: InstallationProduct;
}
