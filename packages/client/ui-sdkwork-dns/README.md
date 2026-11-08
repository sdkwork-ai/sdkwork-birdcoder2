---
description: "SDKWork domain (DNS) management plugin (browser half): the 域名管理 row below 公众号账号 and the 90%-viewport modal over the deployments app API — root domains, subdomain ownership verification, and DNS resolution records."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-dns

English | [中文](README.zh.md)

## Summary

SDKWork domain management plugin (browser half): registers the **域名管理** row in the settings-menu popover, directly below 公众号账号, and the 90%-viewport modal it opens at the root-scoped `settings.dns` seat. The modal manages the signed-in account's root domains (zones), their subdomains and ownership verification, and the DNS resolution records synced from the zone's cloud account. All operations are the deployments app API's `domain` surface (`@sdkwork/deployments-app-sdk`) — the same authority the sdkwork-webserver console reads — so the plugin introduces no second backend contract.

## Table of Contents

- [How it works](#how-it-works)
- [Build](#build)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## How it works

- `src/client/index.ts` registers the `dns` locale dictionaries, mounts the `DnsHost` adapter, and contributes the modal to the `settings.dns` seat (single seat; the runtime grant lives in `ui-sdkwork-settings-menu`'s `mode.rail.settings` children table).
- `src/client/dnsHost.ts` builds one generated deployments client from the shared `ui-sdkwork-env` gateway origin and the `ui-sdkwork-iam` session, mirroring the session into the browser-global token manager before every read. A host revision counter moves on every environment or session transition, so the modal re-reads the client after an environment switch even while readiness stays true.
- `src/client/DnsModal.tsx` is the modal frame: it decides whether a gateway origin is configured, whether an IAM session exists, and which client the workspace calls, then renders `DnsWorkspace`. Its dismissal paths are the header button, a mask click, and Escape. Creating a root domain and adding a subdomain or DNS record open left `Drawer`s above the modal.
- `src/client/DnsWorkspace.tsx` owns the root-domain ledger (`scope: USER`, so the platform's `app.<suffix>` zones are not presented as "my root domains"), the create form (apex, optional display name, DNS provider, and cloud account), pause/resume, and deletion behind an inline confirmation. It hands one selected zone to `ZoneDetail`.
- `src/client/ZoneDetail.tsx` owns the per-zone subdomain ledger (create, verify, delete) and the DNS resolution ledger (sync from the cloud account, create, pause/resume, delete). Verification instructions render the TXT record name and proof exactly as the API returned them.
- `src/client/dnsView.ts` holds the pure hostname/DNS validation (ASCII and IDN apexes, zone-relative names with one leftmost wildcard, record owners including `@`, TTL and priority parsing) and the locale-free timestamp formatting, so the component tests can assert the accepted shapes without a rendered tree.
- Internationalization follows `sdkwork-specs` (`I18N_SPEC.md`): every user-visible string lives in `src/client/locales.ts` (zh is the key-set source of truth, en is checked complete), and dark/light adaptation uses only `--dsw-alias-*` tokens that flip with the host theme.

<a id="build"></a>
## Build

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-dns bundle
```

<a id="dev-note"></a>
## Dev Note

The modal is browser-only; the host half of this package is an empty `apply`. It imports no other feature plugin: shared declarations come through `import type`, and the only runtime collaboration is the injected `env`/`iam` services plus the `settings.dns` slot grant. The generated deployments client is bundled privately, so neither the web shell nor another plugin gains a new module-table identity.

## Model Experience

None, as the plugin renders browser-side domain management chrome and its business HTTP requests remain separate from Harness model requests.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The ledger reads one page of 100 rows per list (zones, subdomains, records). A tenant above that size needs cursor pagination, which is not exposed yet.
- Cloud-account creation is not part of this surface: the zone form offers the accounts the provider account center already holds, and an account without a credential is refused by the service. Registering or rotating the credential itself stays in that center.
- DNS records support create, delete, and pause/resume; the replace-in-place request (`PATCH`) and the WeChat MP verification-file workflow are not exposed yet.
- Deleting a zone is limited to an empty zone by the service; the modal surfaces the service refusal rather than pre-checking hostname counts.
