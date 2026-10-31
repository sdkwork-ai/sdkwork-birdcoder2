# Git-linked plugins

Third-party DSH plugins this fork ships **inside the repository** rather than
asking the user to install them. Each entry is a Git submodule that is also a
pnpm workspace member, so `pnpm install` links the plugin and installs its own
runtime dependencies, and a bundle patch can mount it by name like any other
package.

This directory is deliberately neither of the two neighbours it resembles:

| Directory | What it holds | Owned by |
|---|---|---|
| `vendor/` | Source copies of the Cordis framework, rescoped to `@deepseek-ai/*` | This fork (edited here) |
| `packages/` | Packages this repository authors | This fork (edited here) |
| `plugins/` | Whole external plugins, pinned to an upstream commit | The upstream project (never edited here) |

Nothing here is rescoped or edited. A local fix belongs upstream, followed by a
pin bump; the [naming contract](../AGENTS.md#sdkwork-fork-naming-contract)
applies to fork-authored packages, and these keep their upstream names on
purpose so `git submodule update` stays a fast-forward.

`plugins/*` is outside tsdown's build globs (`vendor/*`, `packages/*/*`): each
plugin ships its own build, and its artifacts are committed upstream instead of
being produced by this repository's build.

## dsh-im — IM channels

[`dsh-im`](https://github.com/xmanrui/dsh-im) connects IM robots (Feishu, WeChat,
WeCom, DingTalk, QQ, Slack, Telegram, Discord, WhatsApp, iMessage, Matrix) to
the harness and adds one `设置 → IM机器人` settings page. It is mounted by
`packages/bundle/web-app/cordis.patch.yml` as the `xmanrui-dsh-im` row, which
the desktop layer (`dsh-sdkwork-desktop-app`) inherits, so a shipped build
offers the surface with no installer step.

**Pin.** The gitlink is `2f51dcb`, the upstream `main` tip four commits past
`v5.1.0`. A pin has to be a revision where upstream's committed `lib/index.js`
and `lib/client.js` and their sources agree, which matters because this
repository runs those artifacts as shipped rather than rebuilding them. A
release commit is the usual such point; this tip qualifies because the commits
after `v5.1.0` rebuilt `lib/client.js` with their source changes.

**Update.**

```sh
git submodule update --remote plugins/dsh-im   # follows `branch = main`
pnpm install                                   # relink and refresh the lockfile
pnpm exec vitest run packages/bundle/web-app/tests/built-in-im.spec.ts
```

Then commit the new gitlink with the refreshed `pnpm-lock.yaml`, and boot
`pnpm dsh web` once to confirm the row still activates and the settings page
still renders. Re-check upstream for a new release before each release of this
fork: nothing here notices one, so an unreviewed pin silently ships the previous
plugin. Prefer a tag over `main` when the new release is available:
`main` carries commits between releases whose built artifacts may lag their
sources (locale JSON is loaded at runtime, so it can legitimately move between
releases; the bundled `lib/*.js` cannot). The current pin is a `main` tip
because the commits after `v5.1.0` did rebuild `lib/client.js`; a later release
tag containing them is still the preferred next pin.

**Dependencies.** `pnpm install` installs the plugin's own dependencies into
`plugins/dsh-im/node_modules`. Most channels are inlined into the committed
`lib/index.js`; the few the plugin loads at runtime (`dingtalk-stream`,
`imapflow`, `nodemailer`, `qrcode`, `undici`, Sharp, the Tencent and WeCom
connectors) resolve from that directory. `@whiskeysockets/baileys` is denied in
`pnpm-workspace.yaml` `allowBuilds` because its build input is already inlined
and its `prepare` script recompiles TypeScript this repository never runs.

**Rebuilding from source** is only needed when working on the plugin itself, not
to ship it:

```sh
pnpm --dir plugins/dsh-im run build   # needs that package's Baileys build approved first
```

**Turning it off.** Disable the row from a later patch layer
(`- id: xmanrui-dsh-im` with `disabled: true`) or delete it from the web-app
patch. The plugin owns no other composition surface, so either form removes the
settings page and every channel with it.

**CI.** Every workflow checkout that installs or builds the workspace uses
`submodules: recursive`; a job that checks out without it finds an empty
`plugins/dsh-im` and fails workspace resolution.

**Windows checkouts.** The submodule carries no `.gitattributes` of its own and
the parent's rules do not reach inside it, so a Windows checkout inherits the
machine's `core.autocrlf` and `bin/dsh-im.mjs` arrives with a CRLF shebang, which
`pnpm pack` refuses with `ERR_PNPM_BIN_CRLF`. The desktop packaging normalizes the
plugin's `bin/*` shebangs before packing it (`normalizePackedPluginShebangs` in
`apps/desktop/scripts/package-target.ts`), so a build needs no manual step; a
`git submodule update` restores the CRLF form and the next packaging run
normalizes it again.

**Verification.** `packages/bundle/web-app/tests/built-in-im.spec.ts` asserts
the composed row, the linked manifest's `dsh.client` web declaration, and both
built entry artifacts, and proves the check rejects each incomplete form
(missing row, disabled row, wrong name, unresolved submodule, lost declaration,
missing artifact).

## dsh-better-sidebar — the right-sidebar workbench and the left-column page model

[`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) is the
open sidebar foundation this fork ships: a plugin contributes a page through a
service (`{ id, title, icon, order }`) and the host draws the row and the page
body. It is **mounted by default** as the `better-sidebar` row in
`packages/bundle/web-app/cordis.patch.yml`, so a shipped build offers its file
tree, Git, changes, tasks, side chat, editor and terminal pages in the right
Sidebar with no installer step. Its host half serves the `/sidebar/*` routes
(file tree, streaming reads, uploads, Git, bundles, side-chat push).

The package's own `dsh.bundle.patch` is deliberately **not** added to the
profile's bundle list: the web-app row is the single mount, so the plugin's
`disabled` double-mount guard never has to reason about a second instance.

The fork's left column (`packages/client/ui-sdkwork-sidebar`) mirrors the same
page model through `ctx.sdkworkSidebar`, and
`packages/client/ui-sdkwork-sidebar/tests/better-sidebar-contract.client.spec.ts`
fails when the submodule's tracked files are modified or when upstream's
`TabDescriptor` stops declaring `id`, `title`, `icon` or `order`.

**Read-only.** Nothing in this repository edits, patches or re-vendors this
submodule; a missing capability is fixed upstream, released and pulled in by
moving the pin ([root rule](../AGENTS.md#third-party-plugin-submodules-are-read-only-merge-stable-contract)).
The workspace installs it as a member (`plugins/*`), which runs its own
`prepare` build and produces the gitignored `lib/` artifacts the row loads;
`pnpm --dir plugins/dsh-better-sidebar run build` (or the root
`build:better-sidebar` script) rebuilds them from the pinned source.

**Surface overlap.** The fork's right Sidebar already ships its own workspace
file tree, terminal, browser and document-preview tabs, and this plugin adds
its own file tree, Git, changes, tasks, side chat and editor beside them. Both
sets are live by default; a deployment that wants only one side removes the
other's rows rather than editing either package.

**Turning it off.** Disable the row from a later patch layer
(`- id: better-sidebar` with `disabled: true`) or delete it from the web-app
patch. Every page, route and service it owns goes with it; the left column's
`ctx.sdkworkSidebar` registry is independent and keeps working.

**Pin.** The gitlink is `b0e0fab`, the `v0.28.2` release commit (`dev` merged for
the cold-cwd read fix). Unlike `dsh-im`, upstream does not commit `lib/`, so the
pin must be a revision whose tagged source this repository's install builds
successfully — prefer a release tag over a `dev` tip.

**Update.**

```sh
git submodule update --remote plugins/dsh-better-sidebar   # follows `branch = dev`
cd plugins/dsh-better-sidebar && git checkout vX.Y.Z       # prefer a release tag
cd ../.. && pnpm install                                   # relink, rebuild, refresh the lockfile
pnpm exec vitest run packages/client/ui-sdkwork-sidebar/tests packages/bundle/web-app/tests
```

Then commit the new gitlink with the refreshed `pnpm-lock.yaml`. If the release
renames a descriptor field, update
`packages/client/ui-sdkwork-sidebar/src/client/service.ts` in the same commit —
the contract spec fails until it matches.
