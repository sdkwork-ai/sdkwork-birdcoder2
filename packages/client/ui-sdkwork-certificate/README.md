---
description: "SDKWork certificate management plugin (browser half): the 证书管理 row below 域名管理 and the 90%-viewport modal over the deployments app API — the certificate ledger, issuance from verified hostnames, manual renewal, and deletion."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-certificate

English | [中文](README.zh.md)

## Summary

SDKWork certificate management plugin (browser half): registers the **证书管理** row in the settings-menu popover, directly below 域名管理, and the 90%-viewport modal it opens at the root-scoped `settings.certificates` seat. The modal shows the signed-in account's TLS certificates, issues a single-domain or wildcard certificate from hostnames that already passed ownership verification, renews a certificate on demand, and deletes one behind an inline confirmation. Every operation is the deployments app API's `certificate` surface, with the `domain` surface supplying the verified hostnames — the same authority the sdkwork-webserver console reads.

## Table of Contents

- [How it works](#how-it-works)
- [Build](#build)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="how-it-works"></a>
## How it works

- `src/client/index.ts` registers the `certificate` locale dictionaries, mounts the `CertificateHost` adapter, and contributes the modal to the `settings.certificates` seat (single seat; the runtime grant lives in `ui-sdkwork-settings-menu`'s `mode.rail.settings` children table).
- `src/client/certificateHost.ts` builds one generated deployments client from the shared `ui-sdkwork-env` gateway origin and the `ui-sdkwork-iam` session, mirroring the session into the browser-global token manager before every read. A host revision counter moves on every environment or session transition, so the modal re-reads the client after an environment switch even while readiness stays true.
- `src/client/CertificateModal.tsx` is the modal frame: it decides whether a gateway origin is configured, whether an IAM session exists, and which client the workspace calls, then renders `CertificateWorkspace`. Its dismissal paths are the header button, a mask click, and Escape. Issuing a certificate opens a left `Drawer` above the modal.
- `src/client/CertificateWorkspace.tsx` owns the certificate ledger (name, source, scope, covered identifiers, status, validity window with the server-computed days left, auto-renew), the issuance form, renewal, and deletion behind an inline confirmation. The issuance form lists only `VERIFIED` hostnames, grouped by root domain, and submits their row ids as `domainIds`.
- Issuance validation lives in `src/client/certificateView.ts`: a name is required, at least one hostname must be selected, a `WILDCARD` scope may only include wildcard hostnames, and a `SINGLE_DOMAIN` scope may only include exact hostnames. The helper returns a problem discriminant; the component owns the localized message.
- Internationalization follows `sdkwork-specs` (`I18N_SPEC.md`): every user-visible string lives in `src/client/locales.ts` (zh is the key-set source of truth, en is checked complete), and dark/light adaptation uses only `--dsw-alias-*` tokens that flip with the host theme.

<a id="build"></a>
## Build

```sh
pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-certificate bundle
```

<a id="dev-note"></a>
## Dev Note

The modal is browser-only; the host half of this package is an empty `apply`. It imports no other feature plugin: shared declarations come through `import type`, and the only runtime collaboration is the injected `env`/`iam` services plus the `settings.certificates` slot grant. The generated deployments client is bundled privately, so neither the web shell nor another plugin gains a new module-table identity.

## Model Experience

None, as the plugin renders browser-side certificate management chrome and its business HTTP requests remain separate from Harness model requests.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The ledger reads one page of 100 certificates and the picker reads one page of 100 hostnames per root domain. A larger tenant needs cursor pagination, which is not exposed yet.
- Issuance is limited to hostnames that already passed ownership verification; creating or verifying them stays in the Domains modal. Custom/uploaded certificate material and the renewal ledger are not exposed here.
- The issuance request leaves the CA profile and key algorithm at their documented defaults; an operator who needs the staging CA or ECDSA selects them in the sdkwork-webserver console.
- A renewal is a manual command here; the scheduled renewal the control plane runs is reflected only through the certificate's `renewalStatus` and validity window.
