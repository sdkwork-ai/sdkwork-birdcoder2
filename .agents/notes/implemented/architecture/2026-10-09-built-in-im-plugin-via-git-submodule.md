# Agent Note: Built-in IM channels from a git-linked third-party plugin

Status: implemented

English | [中文](2026-10-09-built-in-im-plugin-via-git-submodule.zh.md)

## Problem

The product ships Web and desktop surfaces with no IM-channel capability. Connecting WeChat, Feishu, DingTalk, WeCom, QQ, Slack, Telegram, Discord, WhatsApp, iMessage or Matrix to a local harness means the user finds `@xmanrui/dsh-im` on their own, runs `dsh plugin --profile web add -w @xmanrui/dsh-im`, and restarts the host — and a shipped build has no such surface at all until they do.

Making the surface built-in needs three things at once: the plugin present in a shipped build, enabled without any installer step, and updatable without re-porting somebody else's code into this repository on every release.

## Decision

`@xmanrui/dsh-im` is linked into this repository as the `plugins/dsh-im` git submodule, joins the pnpm workspace as a member, and is composed by the Web bundle's own patch. Nothing about it is edited here.

### Composition

`packages/bundle/web-app/cordis.patch.yml` carries one row:

```yaml
- id: xmanrui-dsh-im
  name: '@xmanrui/dsh-im'
```

That single row is the whole integration surface. The host half owns every channel connection and the delivery core and declares `inject: ['connection', 'credentials', 'typertGateway']`, all three of which the base and Web layers already provide. The browser half is an ordinary `dsh.client` bundle: `@deepseek-ai/dsh-client-modules` scans the row's manifest, resolves `exports["./client"]`, and serves it as `/plugins/@xmanrui/dsh-im/client.js`; the plugin then registers exactly one `settings.section` row (`order: 21`) into whatever settings shell the profile mounts, which is the fork's `ui-sdkwork-settings-menu`. `dsh-sdkwork-desktop-app` patches over `dsh-web-app`, so the desktop profile inherits the row and needs no second declaration.

The plugin is a black box by construction: its bundles import no `@deepseek-ai/*` package, reaching the harness only through the cordis context. Its only edges into this repository are the row and the dependency declaration.

### Pin and updates

The gitlink is pinned to the upstream release tag `v4.38.0`, not to `main`. Upstream commits its built `lib/index.js` and `lib/client.js`, and this repository runs those artifacts as shipped, so the pin has to be a revision where the tagged source and the committed build agree — which is what a release commit is. `branch = main` is recorded in `.gitmodules` so `git submodule update --remote plugins/dsh-im` advances the pin; locale JSON is loaded at runtime and may legitimately move between releases, the bundled `lib/*.js` may not.

### Workspace membership and dependencies

`plugins/*` joins `pnpm-workspace.yaml`. Membership is what installs the plugin's own runtime dependencies: most channels are inlined into the committed bundle, but the connectors it statically imports (`dingtalk-stream`, `imapflow`, `nodemailer`, `qrcode`, `undici`, Sharp, the Tencent and WeCom SDKs) resolve from `plugins/dsh-im/node_modules`. `@whiskeysockets/baileys` is denied in `allowBuilds`: its build input is already inlined and its `prepare` script recompiles TypeScript this repository never runs.

`plugins/*` stays outside tsdown's build globs (`vendor/*`, `packages/*/*`) and outside the config catalog (`packages/*/*/package.json`), so neither the repository build nor the gate corpus acquires a plugin that owns its own build.

### Licensing

Membership puts the plugin's `dependencies` in front of `gen-third-party-notices`, which treats every runtime declaration outside its dev-only areas as distributed. That surfaced two terms the permissive allowlist did not carry:

- `nodemailer` declares `MIT-0`, now in `PERMISSIVE_LICENSES`. `MIT-0` is the MIT grant without the attribution condition, so listing it relaxes nothing.
- `@tencent-connect/qqbot-connector` declares `UNLICENSED`, which grants no license at all. It carries an identity-scoped owner authorization beside the Claude Agent SDK's, and the generated notices record it as an authorization rather than as a permissive term. The authorization rests on the same fact upstream's own notices state: the package is loaded from its installed copy at runtime and no connector source is copied into any artifact this repository builds.

### Naming

The [naming contract](2026-08-21-sdkwork-prefix-naming-contract.md) requires fork-authored entries to carry the `sdkwork` marker so upstream syncs cannot collide with them. This plugin is neither authored nor customized here: renaming it would break its own build and turn every upstream update into a re-port. It is protected from upstream collisions by its location instead — upstream has no `plugins/` directory — and by the gitlink, which a merge cannot rewrite into somebody else's version.

### Verification

`packages/bundle/web-app/tests/built-in-im.spec.ts` asserts the composed row, the linked manifest's `dsh.client` web declaration, and both built entry artifacts, and proves the check rejects each incomplete form: a missing row, a disabled row, a wrong package name, an unresolved submodule, a lost browser declaration, and a missing artifact. `plugins/README.md` records the update procedure.

## Alternatives considered

**A registry dependency** — declare `@xmanrui/dsh-im` from npm, which is exactly what `dsh plugin add` does and what upstream publishes. It is the smallest change and keeps the plugin's dependency closure out of this workspace entirely. It lost on the two things the integration is for: the pin would be a version number rather than a reviewable revision, and the plugin's source would not be in the repository at all, so an urgent fix would wait on an upstream release. The npm route also does not avoid the licensing question — the same `UNLICENSED` package arrives with the tarball, disclosed in upstream's notices rather than ours.

**Source-vendoring into `vendor/`** — follow the Cordis packages. Vendored entries are rescoped to `@deepseek-ai/*`, are tsdown build targets, and carry a local-modification log against a pinned upstream commit. A foreign package cannot be rescoped without breaking its own build and its upstream identity, and vendoring means merging every release by hand.

**Copying it into `packages/client/ui-sdkwork-im`** — satisfies the naming contract on its face. It would make the plugin a fork-owned package whose every upstream change is a manual re-port, which is the cost this decision exists to avoid.

**A sibling checkout pinned by `scripts/sdkwork-sources.manifest.json`** — the mechanism SDKWork siblings already use. Its composite action hard-codes `https://github.com/sdkwork-ai/<name>.git` and validates `^sdkwork-[a-z0-9-]+$`, so a third-party repository cannot be expressed as a row.

**A `link:` dependency without workspace membership** — keeps the plugin out of the workspace graph. It also installs none of the plugin's dependencies, so every channel that loads a connector at runtime would fail; the surface would look built-in and be broken.

## Consequences

The settings surface, all thirteen channels, and the AI Office connector exist in a shipped build with no installer step, and an upstream release becomes a pin bump plus a lockfile refresh.

The cost is that `pnpm install` now installs the plugin's closure (~106 packages) for every checkout, and that one of them is `UNLICENSED`: the authorization is a recorded decision, not a resolved risk, and a version bump of that package re-opens it. Every workflow checkout that installs or builds the workspace must use `submodules: recursive`; a job that omits it finds an empty `plugins/dsh-im` and fails workspace resolution rather than silently skipping the plugin.

The pin is manual. Nothing in this repository notices that upstream shipped a new release, and a stale pin silently ships an old plugin — the fix is the scheduled pin review in `plugins/README.md`, not a gate.
