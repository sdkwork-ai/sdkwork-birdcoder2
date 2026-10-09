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

**Pin.** The gitlink is the release tag `v4.38.0`. A release commit is the point
where upstream's committed `lib/index.js` and `lib/client.js` and the tagged
source agree, which matters because this repository runs those artifacts as
shipped rather than rebuilding them.

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
releases; the bundled `lib/*.js` cannot).

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

**Verification.** `packages/bundle/web-app/tests/built-in-im.spec.ts` asserts
the composed row, the linked manifest's `dsh.client` web declaration, and both
built entry artifacts, and proves the check rejects each incomplete form
(missing row, disabled row, wrong name, unresolved submodule, lost declaration,
missing artifact).
