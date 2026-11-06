# Agent Note: Domain and certificate management as two settings-menu plugins

Status: implemented

English | [中文](2026-11-06-domain-and-certificate-settings-plugins.zh.md)

## Problem

The settings menu exposed the account (公众号账号) and the relay credential, but the deployment's public surface — the root domains that host published apps, the subdomains proved to the tenant, the DNS records behind them, and the TLS certificates those names need — had no place in BirdCoder. That authority already exists: the sdkwork-webserver console reads the deployments app API's `domain` and `certificate` surfaces, and the fork already depends on `@sdkwork/deployments-app-sdk` for deploy publishing. The new surface therefore had to appear below 公众号账号 without introducing a second backend contract, without importing a foreign console page, and without letting the two capabilities depend on each other.

## Decision

Two independent client plugins own the surfaces: `ui-sdkwork-dns` (域名管理) and `ui-sdkwork-certificate` (证书管理). Each package owns its settings row, its 80vw modal frame, its workspace, its locale namespace, and its own host adapter. The adapters share only a shape, not code: each builds one generated deployments client from the shared `ui-sdkwork-env` gateway origin and the `ui-sdkwork-iam` session, mirrors the session into the browser-global token manager before every read, and publishes a revision so an environment switch rebuilds the client while the dialog stays mounted.

The settings-menu shell owns visibility. `ui-settings` declares two new root-scoped feature-modal seats, `settings.dns` and `settings.certificates`; the shell grants them in its `mode.rail.settings` children table and toggles them from the two rows inserted below the account rows. Registered rows keep the public-surface order: 公众号账号, 小程序账号, 域名管理, 证书管理, then the relay API-key row. The plugins reach the shell only through `ctx.slots.inject`; neither imports the other, and neither imports the settings-menu package as a value.

The capability itself is the deployments app API, not a new Host surface. DNS uses `domain.domainZones` (zones, hostnames, hostname claims/verification, DNS records, cloud accounts); certificates use `certificate` (ledger, issuance, renewal, deletion) plus the verified hostnames `domain` returns. Issuance submits hostname row ids as `domainIds`, matching the authority's own console.

## Alternatives considered

**Embed the deployments PC console pages.** `DomainManagementPage` and `CertificateManagementPage` exist in `@sdkwork/deployments-pc-console-delivery`, but they are a private console package that expects a router, a console-scoped global stylesheet, and a console page frame. Mounting them inside an 80vw dialog would couple BirdCoder to a console layout it does not own and would still need the console service provider.

**One combined plugin with two tabs.** The requirement names two plugins, and the two capabilities have separate failure modes, locale namespaces, and host operations. One dialog would also put the certificate picker behind the domain ledger's loading state.

**Proxy through the Host.** A Host service would add a second contract over the same authority and move credential handling into the Host for no consumer that needs it. The existing environment/IAM services already supply the transport seam to the browser.

## Consequences

- `packages/client/ui-settings` owns the two seat declarations; `ui-sdkwork-settings-menu` owns the grant, the rows, and the dialog mounting. Both plugins keep 100% source coverage in their own suites, and `apps/web/tests/settings-menu.e2e.ts` proves the rows and both dialogs open in the real web composition.
- Both dialogs read one page of 100 rows per list; pagination, cloud-account registration, DNS record replace (`PATCH`), and the WeChat verification-file workflow stay in the sdkwork-webserver console for now.
- The rendered result was verified in the browser e2e for the menu rows and dialog frames (the scaffold is signed out, so the dialogs show their sign-in gate). The signed-in workspaces are covered by component tests against the generated-client shapes; a live signed-in visual pass against a real gateway has not been recorded.
