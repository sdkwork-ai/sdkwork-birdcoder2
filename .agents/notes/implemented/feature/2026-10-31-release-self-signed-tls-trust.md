# Agent Note: Self-signed HTTPS trust in a release build

Status: implemented

English | [中文](2026-10-31-release-self-signed-tls-trust.zh.md)

## Problem

The desktop shell reaches the SDKWork gateway from two independent network stacks: Chromium carries the renderer, embedded product pages, and the updater's `net` requests, while Node carries the shell's own fetches and the dsh Host with every Node child it starts. A deployment whose gateway serves a self-signed certificate fails on both — `net::ERR_CERT_AUTHORITY_INVALID` in Chromium and `DEPTH_ZERO_SELF_SIGNED_CERT` in Node — and an installed application has no supported way to change that. The source [`desktop:prod --insecure-tls`](../../../../apps/desktop/README.md#develop) lane accepts the certificate for a debug launch, but it passes the Chromium switch on the command line of an unpackaged Electron binary; a double-clicked release offers no such place to add it, and importing the certificate into the operating system's trusted roots needs administrator access a deployment cannot assume.

## Decision

### One resolution, both network stacks

`apps/desktop/src/tls-trust.ts` resolves the decision from three explicit inputs, in decreasing precedence: the `--insecure-tls` argument, `DSH_DESKTOP_INSECURE_TLS=1`, and the packaged manifest field `dshDesktopInsecureTls`. The argument and the environment value each select one launch; the manifest field selects every launch of one build. An unrecognized environment value throws, while a manifest value that is not the boolean `true` keeps verification on: resolution runs before `ready`, where a throw would end the process without the fatal report.

When enabled, `main.ts` applies the decision while its module loads, before `app.whenReady()`: it appends `--ignore-certificate-errors` to Chromium's command line and sets `NODE_TLS_REJECT_UNAUTHORIZED=0` in the process environment. Chromium therefore accepts the certificate for the renderer, embedded pages, webview guests, and the updater's `net` requests; Node accepts it for global `fetch`, undici, and `https`. The macOS login-shell read replaces the Host's environment, so the Host spawn re-applies the variable there, and the Host and the Node children it starts inherit it. The development lane reuses the same switch constant and environment composition, so both lanes accept exactly the same certificates.

### The build carries the default

`DSH_DESKTOP_INSECURE_TLS=1` in the packaging environment or the platform dotenv makes `electron-builder-config.mjs` write `dshDesktopInsecureTls: true` into `extraMetadata`, which merges into the packaged `app.asar/package.json`. Startup reads that field before the first window opens, so an installation built for such a deployment accepts its gateway's certificate on every launch. A lane that omits the setting, including every shipped lane, packages verification on. The [packaging configuration](../../../../apps/desktop/packaging/README.md#configuration-and-local-builds) documents the setting beside the other platform-file fields.

### Packaging shares the same trust

The same setting also lets the packaging run reach self-signed hosts. `package-target.ts` exports `NODE_TLS_REJECT_UNAUTHORIZED=0` to every stage environment — the runtime install through pnpm, electron-builder's Electron distribution and asset downloads, and each preparation step — and to its own version discovery and bucket requests. It also records the decision as `insecureTls` in the run's `run.json`, so a retained build record says whether its downloads accepted unverifiable certificates. One opt-in therefore covers a build whose registry, mirror, or gateway serves a self-signed certificate instead of requiring a second switch.

## Alternatives considered

**Trust a configured CA file instead.** `NODE_EXTRA_CA_CERTS` covers Node, but Chromium honors only the OS trust store, so a bundled CA would need a chain-verifying `setCertificateVerifyProc` on every session — a second certificate verifier to maintain, with its own failure modes. The secure alternatives stay documented beside this opt-in instead.

**Accept any certificate in every release.** It would work without a build switch and without operator action. It also disables verification for every deployment whose gateway already has a valid certificate, turning a local misconfiguration into a silent interception path, so verification stays on unless a build explicitly opts out.

**Handle only `certificate-error` in the main process.** A web-contents handler covers renderer navigation but not the main process's own `net` and Node requests, so it needs the same Node variable anyway; one switch keeps both stacks and both lanes identical.

**Rely on the operating system trust store only.** This is the secure answer and remains documented, but it needs administrator access on the installing machine and cannot be carried by the release artifact a deployment ships.

## Consequences

A build made with the setting accepts certificates Chromium and Node cannot verify for every HTTPS request it makes — the gateway, the update feed, model traffic from the Host, and embedded pages — not only the endpoint that motivated it. Startup prints one warning naming the input that enabled it, and the secure forms (a properly issued certificate, OS trust, `NODE_EXTRA_CA_CERTS`) remain documented as the alternatives. Packaging that enables it accepts the same kind of certificate for its downloads, so the trust decision covers the build inputs as well as the installed application.

## Verification

`pnpm exec vitest run apps/desktop/tests/tls-trust.spec.ts apps/desktop/tests/packaged-tls-trust.spec.ts apps/desktop/tests/package-target-stages.spec.ts apps/desktop/tests/main-startup.spec.ts apps/desktop/tests/online-debug-launch.spec.ts` covers the precedence and validation of the three inputs, the Chromium switch and Node variable, the Host environment after the login-shell read, the packaged metadata, and every packaging stage environment. The Node-side variable is the one the development lane documents as probed for global `fetch`, undici, and `node:https`; the Chromium switch is the same one that lane already launches with.
